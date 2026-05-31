import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RootLayout } from "./layouts/root-layout";
import { Home } from "./screens/home";
import { NewSession } from "./screens/new-session";
import { Session } from "./screens/session";
import { Setup } from "./screens/setup";
import { loadConfig, configExists, applyConfigToEnv } from "./lib/config";

// Load and apply stored API keys before rendering anything
const firstRun = !configExists();
if (!firstRun) {
  const config = await loadConfig();
  applyConfigToEnv(config);
}

const router = createMemoryRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      children: [
        {
          index: true,
          element: <Home />,
        },
        {
          path: "setup",
          element: <Setup />,
        },
        {
          path: "sessions/new",
          element: <NewSession />,
        },
        {
          path: "sessions/:id",
          element: <Session />,
        },
      ],
    },
  ],
  { initialEntries: firstRun ? ["/setup"] : ["/"] },
);

function App() {
  return <RouterProvider router={router} />;
}

const renderer = await createCliRenderer({
  targetFps: 60,
  exitOnCtrlC: false,
});

createRoot(renderer).render(<App />);
