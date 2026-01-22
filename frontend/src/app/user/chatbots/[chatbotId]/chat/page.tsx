"use client";

/**
 * User Chat Page
 *
 * Context:
 * - Next.js App Router project
 * - No authentication
 * - User-facing chat UI
 * - Frontend talks directly to Hasura GraphQL using graphql-request
 *
 * Core Behavior:
 * - Each page load creates a new chat_session
 * - Chat priority:
 *   1. FAQ (exact match on question)
 *   2. Workflow (match userMessage in workflow JSON)
 *   3. RAG (fallback)
 *
 * UI Requirements:
 * - Chat-style UI (user on right, bot on left)
 * - Input box + Send button
 * - Bot messages may show clickable option buttons
 *
 * Workflow Behavior:
 * - Workflow JSON is loaded once
 * - When user message matches workflow.nodes[].userMessage:
 *   - Bot replies with botReply
 *   - Options are shown as buttons
 *   - Button label = target node's userMessage
 * - Clicking an option:
 *   - Acts as a normal user message
 *   - Does NOT populate the input field
 *
 * Data Persistence:
 * - Every user message is saved to chat_messages
 * - Every bot reply is saved to chat_messages
 *
 * Constraints:
 * - Do NOT create API routes
 * - Keep code readable and functional
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { gql } from "graphql-request";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hasuraClient } from "../../../../../lib/hasura";

type Chatbot = {
	id: string;
	name: string;
	start_message: string;
};

type Faq = {
	id: string;
	question: string;
	answer: string;
};

type WorkflowJson = {
	nodes: Array<{
		id: string;
		userMessage: string;
		botReply: string;
		options: Array<{ nextNodeId: string }>;
		position?: { x: number; y: number };
	}>;
};

type WorkflowRow = {
	id: string;
	flow_json: WorkflowJson | null;
};

type ChatSessionRow = {
	id: string;
};

type ChatMessageRow = {
	id: string;
};

type UiOption = {
	label: string;
	value: string;
};

type UiMessage = {
	id: string;
	sender: "user" | "assistant";
	message: string;
	options?: UiOption[];
	ephemeral?: boolean;
};

type ChatHistoryItem = {
	role: "user" | "assistant";
	content: string;
};

const CREATE_SESSION_MUTATION = gql`
	mutation CreateChatSession($chatbotId: uuid!) {
		insert_chatbots_chat_sessions_one(object: { chatbot_id: $chatbotId }) {
			id
		}
	}
`;

const INSERT_MESSAGE_MUTATION = gql`
	mutation InsertChatMessage($sessionId: uuid!, $sender: String!, $message: String!) {
		insert_chatbots_chat_messages_one(object: { session_id: $sessionId, sender: $sender, message: $message }) {
			id
		}
	}
`;

const GET_CHATBOT_FAQS_WORKFLOW_QUERY = gql`
	query GetChatbotFaqsWorkflow($chatbotId: uuid!) {
		chatbots_chatbots_by_pk(id: $chatbotId) {
			id
			name
			start_message
		}
		chatbots_faqs(where: { chatbot_id: { _eq: $chatbotId } }) {
			id
			question
			answer
		}
		chatbots_workflows(where: { chatbot_id: { _eq: $chatbotId } }, limit: 1) {
			id
			flow_json
		}
	}
`;

function makeLocalId(prefix: string): string {
	const random = globalThis.crypto?.randomUUID?.();
	return random ? `${prefix}-${random}` : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalize(text: string): string {
	return String(text ?? "").trim().toLowerCase();
}

function buildChatHistoryFromMessages(allMessages: UiMessage[], maxItems: number): ChatHistoryItem[] {
	const normalizedMax = Math.max(0, Math.min(50, Math.floor(maxItems || 0)));
	if (normalizedMax === 0) return [];

	const history: ChatHistoryItem[] = [];
	for (const m of allMessages) {
		if (m.ephemeral) continue;
		const content = String(m.message ?? "").trim();
		if (!content) continue;
		history.push({ role: m.sender === "user" ? "user" : "assistant", content });
	}

	return history.slice(-normalizedMax);
}

export default function UserChatPage() {
	const params = useParams();
	const chatbotId = params.chatbotId as string;

	const [isLoading, setIsLoading] = useState(true);
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [sessionId, setSessionId] = useState<string | null>(null);
	const [chatbot, setChatbot] = useState<Chatbot | null>(null);
	const [faqs, setFaqs] = useState<Faq[]>([]);
	const [workflowJson, setWorkflowJson] = useState<WorkflowJson | null>(null);

	const [messages, setMessages] = useState<UiMessage[]>([]);
	const [input, setInput] = useState("");

	const messagesRef = useRef<UiMessage[]>([]);
	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const messagesScrollRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const el = messagesScrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [messages]);

	const workflowNodesByUserMessage = useMemo(() => {
		const map = new Map<string, WorkflowJson["nodes"][number]>();
		for (const node of workflowJson?.nodes ?? []) {
			map.set(normalize(node.userMessage), node);
		}
		return map;
	}, [workflowJson]);

	const workflowNodesById = useMemo(() => {
		const map = new Map<string, WorkflowJson["nodes"][number]>();
		for (const node of workflowJson?.nodes ?? []) {
			map.set(node.id, node);
		}
		return map;
	}, [workflowJson]);

	const didInitRef = useRef(false);

	const persistMessage = useCallback(async (sId: string, sender: "user" | "bot", message: string) => {
		await hasuraClient.request<{ insert_chatbots_chat_messages_one: ChatMessageRow }>(INSERT_MESSAGE_MUTATION, {
			sessionId: sId,
			sender,
			message,
		});
	}, []);

	useEffect(() => {
		let isCancelled = false;

		async function init() {
			if (!chatbotId) {
				setIsLoading(false);
				setError("Chatbot id is missing in route params");
				return;
			}

			setIsLoading(true);
			setError(null);
			setMessages([]);
			setInput("");
			setSessionId(null);
			setChatbot(null);
			setFaqs([]);
			setWorkflowJson(null);
			didInitRef.current = false;

			try {
				const created = await hasuraClient.request<{ insert_chatbots_chat_sessions_one: ChatSessionRow }>(
					CREATE_SESSION_MUTATION,
					{ chatbotId }
				);
				const newSessionId = created.insert_chatbots_chat_sessions_one?.id;
				if (!newSessionId) throw new Error("Failed to create chat session");

				const data = await hasuraClient.request<{
					chatbots_chatbots_by_pk: Chatbot | null;
					chatbots_faqs: Faq[];
					chatbots_workflows: WorkflowRow[];
				}>(GET_CHATBOT_FAQS_WORKFLOW_QUERY, { chatbotId });

				if (isCancelled) return;
				setSessionId(newSessionId);
				setChatbot(data.chatbots_chatbots_by_pk);
				setFaqs(data.chatbots_faqs ?? []);
				setWorkflowJson(data.chatbots_workflows?.[0]?.flow_json ?? null);

				const startMessage = data.chatbots_chatbots_by_pk?.start_message ?? "";
				const firstBotMessage = startMessage || "Hi! How can I help you today?";
				const uiMsg: UiMessage = {
					id: makeLocalId("bot"),
					sender: "bot",
					message: firstBotMessage,
				};
				setMessages([uiMsg]);
				await persistMessage(newSessionId, "bot", firstBotMessage);
				didInitRef.current = true;
			} catch (e) {
				if (isCancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (!isCancelled) setIsLoading(false);
			}
		}

		init();
		return () => {
			isCancelled = true;
		};
	}, [chatbotId, persistMessage]);

	const computeBotReply = useCallback(
		(userText: string): { reply: string; options: UiOption[]; source: "faq" | "workflow" | "rag" } => {
			const normalized = normalize(userText);
			const faq = faqs.find((f) => normalize(f.question) === normalized);
			if (faq) {
				return { reply: faq.answer ?? "", options: [], source: "faq" };
			}

			const node = workflowNodesByUserMessage.get(normalized) ?? null;
			if (node) {
				const options: UiOption[] = (node.options ?? [])
					.map((o) => workflowNodesById.get(o.nextNodeId))
					.filter((target): target is WorkflowJson["nodes"][number] => Boolean(target))
					.map((target) => ({ label: target.userMessage ?? "", value: target.userMessage ?? "" }))
					.filter((o) => Boolean(normalize(o.value)));

				return { reply: node.botReply ?? "", options, source: "workflow" };
			}

			return { reply: "", options: [], source: "rag" };
		},
		[faqs, workflowNodesById, workflowNodesByUserMessage]
	);

	type RagSource = { text: string; score: number; filename: string };

	const callRag = useCallback(
  async (payload: {
    chatbot_id: string;
    user_message: string;
    chat_history: ChatHistoryItem[];
  }) => {
    // 🔥 IMPORTANT: explicit backend URL
    const url = `http://localhost:8000/chat/rag?chatbot_id=${encodeURIComponent(
      payload.chatbot_id
    )}&user_message=${encodeURIComponent(payload.user_message)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload.chat_history ?? []),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RAG failed (${res.status}): ${text}`);
    }

    const data = await res.json();

    if (typeof data?.answer !== "string") {
      throw new Error("Invalid RAG response");
    }

    return {
      answer: data.answer,
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  },
  []
);


	const sendUserMessage = useCallback(
		async (rawText: string) => {
			const text = String(rawText ?? "").trim();
			if (!text) return;
			if (!sessionId) return;
			if (isSending) return;

			setIsSending(true);
			setError(null);

			const userUi: UiMessage = {
				id: makeLocalId("user"),
				sender: "user",
				message: text,
			};

			setMessages((prev) => [...prev, userUi]);

			try {
				await persistMessage(sessionId, "user", text);

				const { reply, options, source } = computeBotReply(text);
				if (source !== "rag") {
					const botUi: UiMessage = {
						id: makeLocalId("bot"),
						sender: "bot",
						message: reply,
						options: options.length ? options : undefined,
					};

					setMessages((prev) => [...prev, botUi]);
					await persistMessage(sessionId, "bot", reply);
					return;
				}

				const typingId = makeLocalId("bot-typing");
				setMessages((prev) => [
					...prev,
					{ id: typingId, sender: "bot", message: "Thinking…", ephemeral: true },
				]);

				let ragReply = "";
				try {
					const history = buildChatHistoryFromMessages([...messagesRef.current, userUi], 8);
					const rag = await callRag({ chatbot_id: chatbotId, user_message: text, chat_history: history });
					ragReply = rag.answer;
				} catch (ragErr) {
					setError(ragErr instanceof Error ? ragErr.message : String(ragErr));
					ragReply = "Sorry — I couldn’t find an answer right now. Please try again.";
				}

				const botUi: UiMessage = {
					id: makeLocalId("bot"),
					sender: "bot",
					message: ragReply,
				};

				setMessages((prev) => [...prev.filter((m) => m.id !== typingId), botUi]);
				await persistMessage(sessionId, "bot", ragReply);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setIsSending(false);
			}
		},
		[callRag, chatbotId, computeBotReply, isSending, persistMessage, sessionId]
	);

	return (
		<main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
			<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
				<div>
					<div style={{ marginBottom: 8 }}>
						<Link href="/user/chatbots" style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>
							← Back
						</Link>
					</div>
					<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
						{chatbot?.name ? chatbot.name : "Chat"}
					</h1>
					<div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
						{isLoading ? "Starting session…" : sessionId ? `Session: ${sessionId}` : `Chatbot: ${chatbotId}`}
					</div>
				</div>
			</div>

			{error ? (
				<div
					style={{
						marginTop: 12,
						padding: 12,
						border: "1px solid #fecaca",
						background: "#fef2f2",
						borderRadius: 12,
						color: "#991b1b",
					}}
				>
					<strong>Error:</strong> {error}
				</div>
			) : null}

			<section
				style={{
					marginTop: 14,
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					overflow: "hidden",
					background: "white",
				}}
			>
				<div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
					<div style={{ fontSize: 13, color: "#6b7280" }}>FAQ → Workflow → RAG</div>
				</div>

				<div ref={messagesScrollRef} style={{ padding: 14, height: 520, overflowY: "auto", background: "#f9fafb" }}>
					{messages.length === 0 ? (
						<div style={{ color: "#6b7280" }}>No messages yet.</div>
					) : (
						<div style={{ display: "grid", gap: 10 }}>
							{messages.map((m) => {
								const isUser = m.sender === "user";
								return (
									<div key={m.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
										<div style={{ maxWidth: "80%" }}>
											<div
												style={{
													padding: "10px 12px",
													borderRadius: 14,
													background: isUser ? "#2563eb" : "white",
													color: isUser ? "white" : "#111827",
													border: isUser ? "1px solid #2563eb" : "1px solid #e5e7eb",
													whiteSpace: "pre-wrap",
													lineHeight: 1.4,
												}}
											>
												{m.message}
											</div>

											{!isUser && m.options?.length ? (
												<div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
													{m.options.map((o) => (
														<button
															key={`${m.id}-${o.value}`}
															type="button"
															onClick={() => {
																void sendUserMessage(o.value);
															}}
															disabled={isLoading || isSending || !sessionId}
															style={{
																background: "#f3f4f6",
																border: "1px solid #e5e7eb",
																borderRadius: 999,
																padding: "8px 10px",
																cursor: isLoading || isSending || !sessionId ? "not-allowed" : "pointer",
																color: "#111827",
																fontSize: 13,
																fontWeight: 700,
															}}
														>
															{o.label}
														</button>
													))}
												</div>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						void sendUserMessage(input);
						setInput("");
					}}
					style={{
						display: "grid",
						gridTemplateColumns: "1fr auto",
						gap: 10,
						padding: 14,
						borderTop: "1px solid #e5e7eb",
						background: "white",
					}}
				>
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder={isLoading ? "Loading…" : "Type a message"}
						disabled={isLoading || isSending || !sessionId}
						style={{
							border: "1px solid #d1d5db",
							borderRadius: 12,
							padding: "12px 12px",
							outline: "none",
						}}
					/>
					<button
						type="submit"
						disabled={isLoading || isSending || !sessionId || !input.trim()}
						style={{
							background: isLoading || isSending || !sessionId || !input.trim() ? "#9ca3af" : "#111827",
							color: "white",
							border: 0,
							borderRadius: 12,
							padding: "12px 14px",
							cursor: isLoading || isSending || !sessionId || !input.trim() ? "not-allowed" : "pointer",
							fontWeight: 800,
						}}
					>
						{isSending ? "Sending…" : "Send"}
					</button>
				</form>
			</section>
		</main>
	);
}
