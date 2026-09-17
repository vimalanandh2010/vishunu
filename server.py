from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Vishnu MCP")
name="vimal"
@mcp.tool()
def hello(name: str) -> str:
    return f"Hello {name}! MCP is working."

if __name__ == "__main__":
    mcp.run()