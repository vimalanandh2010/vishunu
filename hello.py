from mcp.server.fastmcp import FastMCP
app = FastMCP()
@app.tool()
def hello(name: str):
    return f"Hello, {name}!"
