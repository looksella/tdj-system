// Next can attach the per-request CSP nonce only to dynamically rendered HTML.
export const dynamic = "force-dynamic";

export default function AuthRoutesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
