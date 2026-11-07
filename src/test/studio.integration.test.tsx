import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Studio } from "@/components/studio/Studio";
import { AiAssistant } from "@/components/studio/AiAssistant";
import { profileDataset } from "@/lib/profile";
import { pickRoles } from "@/lib/analysis";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Studio integration", () => {
  it("loads examples, rejects bad uploads without replacing data, and clears", async () => {
    const { container } = render(<Studio />);
    fireEvent.click(screen.getAllByRole("button", { name: "Load example" })[0]);
    expect(screen.getByText("healthcare_synthetic.csv")).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("Missing upload input");
    fireEvent.change(input, { target: { files: [new File([], "empty.csv")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("empty"));
    expect(screen.getByText("healthcare_synthetic.csv")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear data" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Load example" })).toHaveLength(3);
  });
  it("loads actual CSV through the upload event", async () => {
    const { container } = render(<Studio />);
    const file = new File(["amount,region\n10,East\n20,West"], "fixture.csv");
    Object.defineProperty(file, "text", { value: async () => "amount,region\n10,East\n20,West" });
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("Missing upload input");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("fixture.csv")).toBeInTheDocument());
    expect(screen.getByLabelText("Primary measure")).toHaveValue("amount");
  });
});

describe("optional Gemini integration", () => {
  const profile = profileDataset([{ amount: "10", region: "PRIVATE" }, { amount: "20", region: "private" }]);
  const roles = pickRoles(profile, "", "fixture.csv");
  function mount() {
    render(<AiAssistant profile={profile} roles={roles} goal="" industry="" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText(/Gemini API key/), { target: { value: "FAKE_TEST_KEY" } });
  }
  it("only sends on command and validates returned columns", async () => {
    const mocked = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [
      { question: "Valid", rationale: "r", chart: "bar", columns_used: ["amount"] },
      { question: "Invented", rationale: "r", chart: "bar", columns_used: ["revenue"] },
    ] }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", mocked); mount();
    expect(mocked).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Suggest questions/ }));
    await screen.findByText("Valid");
    expect(screen.queryByText("Invented")).not.toBeInTheDocument();
    expect(mocked.mock.calls).toHaveLength(1);
    expect(JSON.stringify(mocked.mock.calls)).not.toMatch(/PRIVATE|private/);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByLabelText(/Gemini API key/)).toHaveValue("");
  });
  it.each([429, 400, 403, 500])("shows actionable HTTP %s errors", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: status === 400 ? "API key invalid" : "test error" } }), { status })));
    mount(); fireEvent.click(screen.getByRole("button", { name: /Suggest questions/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(status === 429 ? "Quota" : status === 500 ? "500" : "rejected"));
  });
  it("disabling aborts the pending request and clears the key", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal; return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))); }));
    mount(); fireEvent.click(screen.getByRole("button", { name: /Suggest questions/ }));
    fireEvent.click(screen.getByRole("switch"));
    expect(signal?.aborted).toBe(true);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByLabelText(/Gemini API key/)).toHaveValue("");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});