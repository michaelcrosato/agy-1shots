import "./globals.css";

export const metadata = {
  title: "OneShotForge Dashboard",
  description: "Manage your isolated one-shot scripts and applications",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
