import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;






// import type { NextConfig } from "next";

// // function normalizeBaseUrl(raw: string): string {
// //   const trimmed = String(raw ?? "").trim();
// //   if (!trimmed) return "";
// //   return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
// // }

// // const ragServiceBaseUrl =
// //   normalizeBaseUrl(process.env.RAG_SERVICE_URL) ||
// //   normalizeBaseUrl(process.env.NEXT_PUBLIC_RAG_SERVICE_URL) ||
// //   "http://localhost:8000";

// // const nextConfig: NextConfig = {
// //   async rewrites() {
// //     return [
// //       {
// //         source: "/rag/:path*",
// //         destination: `${ragServiceBaseUrl}/:path*`,
// //       },
// //     ];
// //   },
// // };

// export default nextConfig;
