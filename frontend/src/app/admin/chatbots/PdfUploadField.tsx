"use client";

import { useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PDF_MESSAGE = "pdf must be less than 15 mb";

export function PdfUploadField() {
	const inputId = useId();
	const helpId = `${inputId}-help`;
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [error, setError] = useState<string>("");

	function onChange(event: ChangeEvent<HTMLInputElement>) {
		const input = event.currentTarget;
		const files = Array.from(input.files ?? []);
		const tooLarge = files.some((f) => f.size > MAX_PDF_BYTES);

		if (tooLarge) {
			setError(MAX_PDF_MESSAGE);
			input.setCustomValidity(MAX_PDF_MESSAGE);
			// Clear selection so the user can re-pick immediately.
			input.value = "";
			return;
		}

		setError("");
		input.setCustomValidity("");
	}

	return (
		<label style={{ display: "grid", gap: 6 }}>
			<span style={{ fontSize: 14, fontWeight: 600 }}>PDF upload</span>
			<input
				ref={inputRef}
				id={inputId}
				type="file"
				name="pdfs"
				accept="application/pdf"
				multiple
				onChange={onChange}
				aria-invalid={error ? true : undefined}
				aria-describedby={helpId}
				style={{
					border: "1px solid #d1d5db",
					borderRadius: 10,
					padding: "10px 12px",
				}}
			/>
			<span
				id={helpId}
				style={{ fontSize: 12, color: error ? "#b91c1c" : "#6b7280" }}
			>
				{error || "Upload PDF for RAG knowledge (optional)"}
			</span>
		</label>
	);
}
