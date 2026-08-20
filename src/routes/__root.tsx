import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppErrorComponent } from "@/lib/error-component";
import appCss from "../styles.css?url";

const APP_NAME = "Service Advisor Command Center";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#efece6" },
      {
        name: "description",
        content:
          "Service Advisor Command Center is a lane board for a high-volume Toyota service drive — ROs, follow-ups, updates, and a spare fleet board.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  errorComponent: AppErrorComponent,
  notFoundComponent: NotFound,
  component: RootDocument,
});

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div>
        <p className="text-xs font-medium text-muted">Command Center</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">That page is not here</h1>
        <p className="mt-2 text-sm text-muted">The advisor lane is on the home board.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
          Back to lane board
        </Link>
      </div>
    </main>
  );
}

function RootDocument() {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
