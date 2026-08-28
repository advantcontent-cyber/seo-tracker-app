import "./globals.css";

export const metadata = {
  title: "the AMN — Client Performance Dashboard",
  description: "Client performance dashboard by the AMN — organic search, paid/performance marketing, and reporting across every managed property.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
