/** Example data only: these values are not live safety or transport information. */
export async function GET() {
  return Response.json({
    source: "example",
  }, { headers: { "Cache-Control": "no-store" } });
}

