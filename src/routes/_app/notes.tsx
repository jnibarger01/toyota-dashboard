import { createFileRoute } from "@tanstack/react-router";
import { AiTools } from "@/components/ai-tools";
import { Scratchpad } from "@/components/scratchpad";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/_app/notes")({ component: NotesPage });

function NotesPage() {
  const composer = useAppStore((s) => s.composer);
  const tool = composer?.tool === "cleaner" ? "cleaner" : composer?.tool === "concern" ? "concern" : "update";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notes</h1>
        <p className="mb-4 text-sm text-muted">Customer updates, tech-note cleaner, and concern builder. Never invents findings.</p>
        <Tabs defaultValue={tool}>
          <TabsList>
            <TabsTrigger value="update">Update</TabsTrigger>
            <TabsTrigger value="cleaner">Cleaner</TabsTrigger>
            <TabsTrigger value="concern">Concern</TabsTrigger>
          </TabsList>
          <TabsContent value="update" className="mt-4">
            <AiTools defaultTool="update" />
          </TabsContent>
          <TabsContent value="cleaner" className="mt-4">
            <AiTools defaultTool="cleaner" />
          </TabsContent>
          <TabsContent value="concern" className="mt-4">
            <AiTools defaultTool="concern" />
          </TabsContent>
        </Tabs>
      </div>
      <Scratchpad />
    </div>
  );
}
