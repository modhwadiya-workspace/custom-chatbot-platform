from minio import Minio
from pdf2image import convert_from_bytes
import pytesseract
import os


def extract_text_from_pdf(
    minio_client: Minio,
    bucket_name: str,
    object_name: str,
) -> str:
    """
    Always OCR the PDF:
    - Download PDF from MinIO
    - Convert each page to image
    - Run OCR on each page
    - Return combined text
    """

    # Download PDF bytes from MinIO
    response = minio_client.get_object(bucket_name, object_name)
    pdf_bytes = response.read()
    response.close()
    response.release_conn()

    # Convert PDF pages to images
    images = convert_from_bytes(pdf_bytes)

    all_text = []

    for idx, image in enumerate(images):
        text = pytesseract.image_to_string(image)
        if text:
            all_text.append(text)

    return "\n".join(all_text)
