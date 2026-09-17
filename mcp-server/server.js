import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import fs from "fs/promises";
import path from "path";

const server = new McpServer({
  name: "vishnu-mcp-server",
  version: "1.0.0"
});

// 1. List files
server.registerTool(
  "list_files",
  {
    description: "List files and folders inside a project directory",
    inputSchema: {
      directory: z.string()
    }
  },
  async ({ directory }) => {
    const files = await fs.readdir(directory, { withFileTypes: true });

    return {
      content: [
        {
          type: "text",
          text: files
            .map(file => `${file.isDirectory() ? "[DIR]" : "[FILE]"} ${file.name}`)
            .join("\n")
        }
      ]
    };
  }
);

// 2. Read file
server.registerTool(
  "read_file",
  {
    description: "Read the contents of a project file",
    inputSchema: {
      file_path: z.string()
    }
  },
  async ({ file_path }) => {
    const content = await fs.readFile(file_path, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: content
        }
      ]
    };
  }
);

// 3. Create / overwrite file
server.registerTool(
  "write_file",
  {
    description: "Create or update a project file",
    inputSchema: {
      file_path: z.string(),
      content: z.string()
    }
  },
  async ({ file_path, content }) => {
    await fs.mkdir(path.dirname(file_path), { recursive: true });
    await fs.writeFile(file_path, content, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: `File created/updated successfully: ${file_path}`
        }
      ]
    };
  }
);

void serveStdio(() => server);