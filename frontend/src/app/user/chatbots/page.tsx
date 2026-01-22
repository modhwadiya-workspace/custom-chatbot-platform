/**
 * Context:
 * - Next.js App Router project
 * - No authentication
 * - This is a USER-facing page
 * - Frontend talks directly to Hasura GraphQL using graphql-request
 *
 * Goal of this page:
 * - Fetch and list all chatbots created by admin
 * - Show a clean, simple UI
 * - When user clicks a chatbot, redirect to:
 *   /user/chatbots/[chatbotId]/chat
 *
 * Constraints:
 * - Do NOT create API routes
 * - Do NOT over-engineer
 * - Keep UI clean and consistent
 */

import Link from "next/link";
import { gql } from "graphql-request";

import { hasuraClient } from "../../../lib/hasura";

type Chatbot = {
	id: string;
	name: string;
	start_message: string;
};

const LIST_CHATBOTS_QUERY = gql`
	query ListChatbotsForUser {
		chatbots_chatbots(order_by: { created_at: desc }) {
			id
			name
			start_message
		}
	}
`;

async function fetchChatbots(): Promise<Chatbot[]> {
	const data = await hasuraClient.request<{ chatbots_chatbots: Chatbot[] }>(LIST_CHATBOTS_QUERY);
	return data.chatbots_chatbots;
}

export default async function UserChatbotsPage() {
	const chatbots = await fetchChatbots();

	return (
		<main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
			<h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Chatbots</h1>
			<p style={{ margin: 0, color: "#6b7280" }}>
				Pick a chatbot to start chatting.
			</p>

			<section
				style={{
					marginTop: 18,
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					padding: 16,
				}}
			>
				<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
					<h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Available chatbots</h2>
					<div style={{ fontSize: 13, color: "#6b7280" }}>{chatbots.length} total</div>
				</div>

				{chatbots.length === 0 ? (
					<p style={{ marginTop: 12, color: "#6b7280" }}>No chatbots available yet.</p>
				) : (
					<div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
						{chatbots.map((bot) => (
							<Link
								key={bot.id}
								href={`/user/chatbots/${bot.id}/chat`}
								style={{
									display: "block",
									border: "1px solid #e5e7eb",
									borderRadius: 12,
									padding: 14,
									textDecoration: "none",
									background: "white",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
									<div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{bot.name}</div>
									<div
										style={{
											fontSize: 12,
											fontWeight: 700,
											color: "#2563eb",
											border: "1px solid #bfdbfe",
											background: "#dbeafe",
											padding: "6px 10px",
											borderRadius: 999,
										}}
									>
										Open
									</div>
								</div>

								<div style={{ marginTop: 8, fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
									{bot.start_message ? (
										<span>
											 {bot.start_message}
										</span>
									) : (
										""
									)}
								</div>
							</Link>
						))}
					</div>
				)}
			</section>
		</main>
	);
}
