import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Evolvx AI
          </h1>
          <p className="mt-2 text-muted-foreground">
            Next-Gen Deployment Platform
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
