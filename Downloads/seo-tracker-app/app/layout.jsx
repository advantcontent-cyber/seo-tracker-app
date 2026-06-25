import "./globals.css";

export const metadata = {
  title: "SEO Progress Tracker — Advant Labs",
  description: "Client SEO progress dashboard: GSC-led metrics, seasonal reads, and a 12-month blog plan.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
