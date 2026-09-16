import { Card } from "@/components/ui";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">
          Nambavargal Family Tree
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Sign in with Google to browse the family tree.
        </p>
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <GoogleSignInButton />
      </Card>
    </main>
  );
}
