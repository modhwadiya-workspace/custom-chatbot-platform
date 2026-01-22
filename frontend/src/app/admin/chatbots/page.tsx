/**
 * Context:
 * This is a Next.js App Router project.
 * We are using Hasura GraphQL with PostgreSQL.
 * There is NO authentication.
 * This file is for ADMIN functionality.
 * Frontend directly calls Hasura using graphql-request.
 *
 * Goal of this file:
 * - Fetch list of chatbots
 * - Create a chatbot (name, start_message)
 * - Delete a chatbot
 *
 * Constraints:
 * - Do NOT create API routes
 * - Do NOT use useEffect unnecessarily
 * - Keep code simple and readable
 */

import { gql } from "graphql-request";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasuraClient } from "../../../lib/hasura";

type Chatbot = {
	id: string;
	name: string;
	start_message: string;
};

const LIST_CHATBOTS_QUERY = gql`
	query ListChatbots {
  chatbots_chatbots(order_by: { created_at: desc }) {
    id
    name
    start_message
  }
}
`;

const CREATE_CHATBOT_MUTATION = gql`
	mutation CreateChatbot($name: String!, $start_message: String!) {
		insert_chatbots_chatbots_one(object: { name: $name, start_message: $start_message }) {
			id
		}
	}
`;

const DELETE_CHATBOT_MUTATION = gql`
	mutation DeleteChatbot($id: uuid!) {
		delete_chatbots_chatbots_by_pk(id: $id) {
			id
		}
	}
`;

async function fetchChatbots(): Promise<Chatbot[]> {
	const data = await hasuraClient.request<{ chatbots_chatbots: Chatbot[] }>(
		LIST_CHATBOTS_QUERY
	);
	return data.chatbots_chatbots;
}

/**
 * Admin Chatbots Page
 *
 * - Lists all chatbots
 * - Allows creating a chatbot
 * - Allows deleting a chatbot
 *
 * Uses Hasura GraphQL directly (graphql-request).
 * No authentication.
 */

export default async function AdminChatbotsPage() {
	async function createChatbot(formData: FormData) {
		"use server";

		const name = String(formData.get("name") ?? "").trim();
		const startMessage = String(formData.get("start_message") ?? "").trim();

		if (!name) {
			throw new Error("Chatbot name is required.");
		}
		if (!startMessage) {
			throw new Error("Start message is required.");
		}

		await hasuraClient.request(CREATE_CHATBOT_MUTATION, {
			name,
			start_message: startMessage,
		});

		revalidatePath("/admin/chatbots");
		redirect("/admin/chatbots");
	}

	async function deleteChatbot(formData: FormData) {
		"use server";

		const id = String(formData.get("id") ?? "").trim();
		if (!id) {
			throw new Error("Chatbot id is required.");
		}

		await hasuraClient.request(DELETE_CHATBOT_MUTATION, { id });
		revalidatePath("/admin/chatbots");
		redirect("/admin/chatbots");
	}

	const chatbots = await fetchChatbots();

	return (
		<main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
			<h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
				Admin · Chatbots
			</h1>

			<section
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 12,
					padding: 16,
					marginBottom: 24,
				}}
			>
				<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
					Create chatbot
				</h2>

				<form action={createChatbot} style={{ display: "grid", gap: 12 }}>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={{ fontSize: 14, fontWeight: 600 }}>Name</span>
						<input
							name="name"
							placeholder="e.g. Support Bot"
							required
							style={{
								border: "1px solid #d1d5db",
								borderRadius: 10,
								padding: "10px 12px",
							}}
						/>
					</label>

					<label style={{ display: "grid", gap: 6 }}>
						<span style={{ fontSize: 14, fontWeight: 600 }}>Start message</span>
						<textarea
							name="start_message"
							placeholder="Hi! How can I help you today?"
							required
							rows={3}
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
							style={{
								background: "#111827",
								color: "white",
								border: 0,
								borderRadius: 10,
								padding: "10px 14px",
								cursor: "pointer",
							}}
						>
							Create
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
					Existing chatbots ({chatbots.length})
				</h2>

				{chatbots.length === 0 ? (
					<p style={{ color: "#6b7280" }}>No chatbots yet.</p>
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
										}}
									>
										Name
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
										Start message
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
								{chatbots.map((bot) => (
									<tr key={bot.id}>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												fontWeight: 600,
											}}
										>
											{bot.name}
										</td>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												color: "#374151",
											}}
										>
											{bot.start_message}
										</td>
										<td
											style={{
												padding: "12px",
												borderBottom: "1px solid #f3f4f6",
												textAlign: "right",
											}}
										>
											<div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
												<Link
													href={`/admin/chatbots/${bot.id}/faqs`}
													style={{
														display: "inline-block",
														background: "#dbeafe",
														color: "#1d4ed8",
														border: "1px solid #bfdbfe",
														borderRadius: 10,
														padding: "8px 10px",
														textDecoration: "none",
														fontSize: 14,
														fontWeight: 600,
													}}
												>
													FAQs
												</Link>

												<Link
													href={`/admin/chatbots/${bot.id}/workflow`}
													style={{
														display: "inline-block",
														background: "#dcfce7",
														color: "#166534",
														border: "1px solid #bbf7d0",
														borderRadius: 10,
														padding: "8px 10px",
														textDecoration: "none",
														fontSize: 14,
														fontWeight: 600,
													}}
												>
													Workflow
												</Link>

												<form action={deleteChatbot}>
													<input type="hidden" name="id" value={bot.id} />
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
											</div>
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


