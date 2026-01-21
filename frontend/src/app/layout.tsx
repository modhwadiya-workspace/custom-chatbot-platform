// frontend/src/app/layout.tsx

import "reactflow/dist/style.css";

export const metadata = {
  title: "Custom Chatbot Platform",
  description: "Admin and User chatbot system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
