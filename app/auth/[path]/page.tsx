import {
  AuthView,
  authViewPaths,
} from '@neondatabase/auth-ui';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map(
    (path) => ({
      path,
    })
  );
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{
    path: string;
  }>;
}) {
  const { path } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold">
            S
          </div>

          <h1 className="text-2xl font-bold">
            SimiRork
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Studio IA
          </p>
        </div>

        <AuthView path={path} />
      </div>
    </main>
  );
}