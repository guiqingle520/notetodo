import { McpServer } from '@modelcontextprotocol/server'
import { executeWorkspaceTool, workspaceToolDefinitions, type WorkspaceToolName, type WorkspaceToolRepository } from './tools.js'

export function createNoteTodoMcpServer(repository: WorkspaceToolRepository, rawToken: string) {
  const server = new McpServer(
    { name: 'notetodo-workspace', version: '0.1.0' },
    { instructions: 'Read a page before updating it. Use list_pages to discover IDs. Database writes are type-checked and formula/rollup properties are read-only.' },
  )

  for (const [name, definition] of Object.entries(workspaceToolDefinitions)) {
    server.registerTool(name, {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
    }, async (input: unknown) => {
      try {
        const result = await executeWorkspaceTool(repository, rawToken, name as WorkspaceToolName, input)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }], structuredContent: result as unknown as Record<string, unknown> }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workspace tool failed.'
        return { content: [{ type: 'text' as const, text: message }], isError: true }
      }
    })
  }
  return server
}
