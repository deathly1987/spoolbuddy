import { Route, Switch } from "wouter-preact";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { SpoolDetail } from "./pages/SpoolDetail";
import { Printers } from "./pages/Printers";
import { Settings } from "./pages/Settings";
import { Main } from "./pages/Main";
import { AmsOverview } from "./pages/AmsOverview";
import { WebSocketProvider } from "./lib/websocket";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <WebSocketProvider>
          <Switch>
            {/* Device-style pages (no Layout wrapper) */}
            <Route path="/main" component={Main} />
            <Route path="/ams" component={AmsOverview} />

            {/* Standard pages with Layout */}
            <Route>
              <Layout>
                <Switch>
                  <Route path="/" component={Dashboard} />
                  <Route path="/inventory" component={Inventory} />
                  <Route path="/spool/:id" component={SpoolDetail} />
                  <Route path="/printers" component={Printers} />
                  <Route path="/settings" component={Settings} />
                  <Route>
                    <div class="p-8 text-center">
                      <h1 class="text-2xl font-bold text-[var(--text-primary)]">404 - Not Found</h1>
                    </div>
                  </Route>
                </Switch>
              </Layout>
            </Route>
          </Switch>
        </WebSocketProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
