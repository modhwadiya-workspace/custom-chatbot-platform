"use client";

import { useFormStatus } from "react-dom";

export function CreateChatbotSubmitButton() {
	const { pending } = useFormStatus();

	return (
		<button
			type="submit"
			disabled={pending}
			style={{
				background: pending ? "#374151" : "#111827",
				color: "white",
				border: 0,
				borderRadius: 10,
				padding: "10px 14px",
				cursor: pending ? "not-allowed" : "pointer",
				opacity: pending ? 0.85 : 1,
			}}
		>
			{pending ? "Creating…" : "Create"}
		</button>
	);
}
