"use client";

import { useRef, useState } from "react";

import { CreateChatbotSubmitButton } from "./CreateChatbotSubmitButton";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PDF_MESSAGE = "pdf must be less than 15 mb";

type Props = {
	action: (formData: FormData) => void | Promise<void>;
};

export function CreateChatbotForm({ action }: Props) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [pdfError, setPdfError] = useState<string>("");

	function validateSelectedFilesFromInput(): boolean {
		const input = fileInputRef.current;
		if (!input) return true;

		const files = Array.from(input.files ?? []);
		const tooLarge = files.some((f) => f.size > MAX_PDF_BYTES);

		if (tooLarge) {
			setPdfError(MAX_PDF_MESSAGE);
			input.value = "";
			return false;
		}

		setPdfError("");
		return true;
	}

	async function clientAction(formData: FormData) {
		const pdfValues = formData.getAll("pdfs");
		const pdfFiles = pdfValues
			.filter((v): v is File => v instanceof File)
			.filter((f) => f.size > 0);

		if (pdfFiles.some((f) => f.size > MAX_PDF_BYTES)) {
			setPdfError(MAX_PDF_MESSAGE);
			const input = fileInputRef.current;
			if (input) input.value = "";
			return;
		}

		setPdfError("");
		await action(formData);
	}

	return (
		<form
			action={clientAction}
			style={{ display: "grid", gap: 12 }}
		>
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

			<label style={{ display: "grid", gap: 6 }}>
				<span style={{ fontSize: 14, fontWeight: 600 }}>PDF upload</span>
				<input
					ref={fileInputRef}
					type="file"
					name="pdfs"
					accept="application/pdf"
					multiple
					onChange={validateSelectedFilesFromInput}
					style={{
						border: "1px solid #d1d5db",
						borderRadius: 10,
						padding: "10px 12px",
					}}
				/>
				<span style={{ fontSize: 12, color: pdfError ? "#b91c1c" : "#6b7280" }}>
					{pdfError || "Upload PDF for RAG knowledge (optional)"}
				</span>
			</label>

			<div>
				<CreateChatbotSubmitButton />
			</div>
		</form>
	);
}
