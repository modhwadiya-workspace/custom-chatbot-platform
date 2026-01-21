// export default async function TestParamsPage({
//   params,
// }: {
//   params: Promise<{ chatbotId: string }>;
// }) {
//   const resolvedParams = await params;

//   return (
//     <pre style={{ padding: 20 }}>
//       {JSON.stringify(resolvedParams, null, 2)}
//     </pre>
//   );
// }


/**
 * Admin Chatbot FAQs Page
 *
 * - Lists FAQs for a chatbot
 * - Allows adding a new FAQ
 * - Allows deleting FAQs
 *
 * Uses Hasura GraphQL directly.
 * Chatbot id comes from route params.
 * No authentication.
 */

import Link from "next/link";
import { gql } from "graphql-request";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasuraClient } from "../../../../../lib/hasura";

type Faq = {
	id: string;
	question: string;
	answer: string;
};

type Chatbot = {
	id: string;
	name: string;
};

const GET_CHATBOT_AND_FAQS_QUERY = gql`
	query GetChatbotAndFaqs($chatbotId: uuid!) {
		chatbots_chatbots_by_pk(id: $chatbotId) {
			id
			name
		}
		chatbots_faqs(where: { chatbot_id: { _eq: $chatbotId } }) {
			id
			question
			answer
		}
	}
`;

const CREATE_FAQ_MUTATION = gql`
	mutation CreateFaq($chatbotId: uuid!, $question: String!, $answer: String!) {
		insert_chatbots_faqs_one(object: { chatbot_id: $chatbotId, question: $question, answer: $answer }) {
			id
		}
	}
`;

const DELETE_FAQ_MUTATION = gql`
	mutation DeleteFaq($id: uuid!) {
		delete_chatbots_faqs_by_pk(id: $id) {
			id
		}
	}
`;

async function fetchChatbotAndFaqs(chatbotId: string): Promise<{ chatbot: Chatbot | null; faqs: Faq[] }> {
	const data = await hasuraClient.request<{
		chatbots_chatbots_by_pk: Chatbot | null;
		chatbots_faqs: Faq[];
	}>(GET_CHATBOT_AND_FAQS_QUERY, {
		chatbotId, 
	});

	return {
		chatbot: data.chatbots_chatbots_by_pk,
		faqs: data.chatbots_faqs,
	};
}

export default async function AdminChatbotFaqsPage({
	params,
}: {
	params: Promise<{ chatbotId: string }>;
}) {
	const { chatbotId } = await params;

	if (!chatbotId) {
		throw new Error("Chatbot id is missing in route params");
	}


	async function createFaq(formData: FormData) {
		"use server";

		const question = String(formData.get("question") ?? "").trim();
		const answer = String(formData.get("answer") ?? "").trim();

		if (!question) {
			throw new Error("FAQ question is required.");
		}
		if (!answer) {
			throw new Error("FAQ answer is required.");
		}

		await hasuraClient.request(CREATE_FAQ_MUTATION, {
			chatbotId,
			question,
			answer,
		});

		revalidatePath(`/admin/chatbots/${chatbotId}/faqs`);
		redirect(`/admin/chatbots/${chatbotId}/faqs`);
	}

	async function deleteFaq(formData: FormData) {
		"use server";

		const id = String(formData.get("id") ?? "").trim();
		if (!id) {
			throw new Error("FAQ id is required.");
		}

		await hasuraClient.request(DELETE_FAQ_MUTATION, { id });
		revalidatePath(`/admin/chatbots/${chatbotId}/faqs`);
		redirect(`/admin/chatbots/${chatbotId}/faqs`);
	}

	const { chatbot, faqs } = await fetchChatbotAndFaqs(chatbotId);

	return (
		<main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
			<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
				<div>
					<div style={{ marginBottom: 8 }}>
						<Link
							href="/admin/chatbots"
							style={{
								fontSize: 14,
								color: "#2563eb",
								textDecoration: "none",
							}}
						>
							← Back to Chatbots
						</Link>
					</div>

					<h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
						Admin · FAQs
					</h1>
					<p style={{ margin: 0, color: "#6b7280" }}>
						{chatbot ? (
							<>
								Chatbot: <span style={{ color: "#111827", fontWeight: 600 }}>{chatbot.name}</span>
							</>
						) : (
							<>Chatbot not found for id: {chatbotId}</>
						)}
					</p>
				</div>
			</div>

			<section
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					padding: 16,
					marginTop: 16,
					marginBottom: 24,
				}}
			>
				<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Add FAQ</h2>

				<form action={createFaq} style={{ display: "grid", gap: 12 }}>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={{ fontSize: 14, fontWeight: 600 }}>Question</span>
						<input
							name="question"
							placeholder="e.g. What are your support hours?"
							required
							style={{
								border: "1px solid #d1d5db",
								borderRadius: 10,
								padding: "10px 12px",
							}}
						/>
					</label>

					<label style={{ display: "grid", gap: 6 }}>
						<span style={{ fontSize: 14, fontWeight: 600 }}>Answer</span>
						<textarea
							name="answer"
							placeholder="e.g. We’re available Mon–Fri, 9am–6pm."
							required
							rows={4}
							style={{
								border: "1px solid #d1d5db",
								borderRadius: 10,
								padding: "10px 12px",
								resize: "vertical",
							}}
						/>
					</label>

					<div>
						<button
							type="submit"
							disabled={!chatbot}
							style={{
								background: chatbot ? "#111827" : "#9ca3af",
								color: "white",
								border: 0,
								borderRadius: 10,
								padding: "10px 14px",
								cursor: chatbot ? "pointer" : "not-allowed",
							}}
						>
							Create FAQ
						</button>
					</div>
				</form>
			</section>

			<section
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					padding: 16,
				}}
			>
				<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
					Existing FAQs ({faqs.length})
				</h2>

				{!chatbot ? (
					<p style={{ color: "#6b7280" }}>Create/assign the chatbot first, then add FAQs.</p>
				) : faqs.length === 0 ? (
					<p style={{ color: "#6b7280" }}>No FAQs yet.</p>
				) : (
					<div style={{ overflowX: "auto" }}>
						<table
							style={{
								width: "100%",
								borderCollapse: "separate",
								borderSpacing: 0,
							}}
						>
							<thead>
								<tr>
									<th
										style={{
											textAlign: "left",
											padding: "10px 12px",
											borderBottom: "1px solid #e5e7eb",
											fontSize: 12,
											color: "#6b7280",
											fontWeight: 700,
											textTransform: "uppercase",
											letterSpacing: 0.5,
											width: "35%",
										}}
									>
										Question
									</th>
									<th
										style={{
											textAlign: "left",
											padding: "10px 12px",
											borderBottom: "1px solid #e5e7eb",
											fontSize: 12,
											color: "#6b7280",
											fontWeight: 700,
											textTransform: "uppercase",
											letterSpacing: 0.5,
										}}
									>
										Answer
									</th>
									<th
										style={{
											textAlign: "right",
											padding: "10px 12px",
											borderBottom: "1px solid #e5e7eb",
											fontSize: 12,
											color: "#6b7280",
											fontWeight: 700,
											textTransform: "uppercase",
											letterSpacing: 0.5,
											width: 120,
										}}
									>
										Actions
									</th>
								</tr>
							</thead>

							<tbody>
								{faqs.map((faq) => (
									<tr key={faq.id}>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												fontWeight: 600,
												verticalAlign: "top",
											}}
										>
											{faq.question}
										</td>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												color: "#374151",
												verticalAlign: "top",
											}}
										>
											{faq.answer}
										</td>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												textAlign: "right",
												verticalAlign: "top",
											}}
										>
											<form action={deleteFaq}>
												<input type="hidden" name="id" value={faq.id} />
												<button
													type="submit"
													style={{
														background: "#fee2e2",
														color: "#991b1b",
														border: "1px solid #fecaca",
														borderRadius: 10,
														padding: "8px 10px",
														cursor: "pointer",
													}}
												>
													Delete
												</button>
											</form>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</main>
	);
}