import { describe, expect, it } from "vitest";
import { buildBoard, classifyProject, isOpenHandoff, type AttQuote, type AttRequest, type AttVersion } from "../src/lib/attention";

const NOW = Date.parse("2026-10-17T15:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function req(status: AttRequest["status"], hoursAgo: number, project = "p1"): AttRequest {
  n++;
  return { id: `r${n}`, short_id: `S${n}`, project_id: project, raw_text: `pedido ${n}`, summary: null, status, created_at: ago(hoursAgo) };
}
const quote = (status: AttQuote["status"], hoursAgo: number, project = "p1"): AttQuote => ({
  id: `q${hoursAgo}`, status, title: "Tienda online", created_at: ago(hoursAgo), project_id: project, request_short_id: "Q1",
});
const data = (requests: AttRequest[], quotes: AttQuote[] = [], versions: AttVersion[] = []) => ({ requests, quotes, versions });

describe("classifyProject", () => {
  it("esperando_agencia va a Te necesita con el botón Aprobar", () => {
    const p = classifyProject("p1", data([req("publicado", 5), req("esperando_agencia", 2)]), NOW);
    expect(p.column).toBe("te_necesita");
    expect(p.item?.kind).toBe("aprobar");
    expect(p.item?.action).toBe("aprobar");
  });

  it("un presupuesto en borrador va a Te necesita y lleva a Presupuestos", () => {
    const p = classifyProject("p1", data([req("cotizado", 3)], [quote("borrador", 3)]), NOW);
    expect(p.column).toBe("te_necesita");
    expect(p.item?.action).toBe("presupuesto");
    expect(p.item?.quoteId).toBe("q3");
  });

  it("un presupuesto enviado o esperando_cliente va a Esperando al cliente", () => {
    expect(classifyProject("p1", data([req("cotizado", 3)], [quote("enviado", 3)]), NOW).column).toBe("esperando_cliente");
    expect(classifyProject("p1", data([req("esperando_cliente", 1)]), NOW).column).toBe("esperando_cliente");
  });

  it("interpretando, agente_trabajando y publicando van a En curso", () => {
    for (const s of ["interpretando", "agente_trabajando", "publicando"] as const) {
      expect(classifyProject("p1", data([req(s, 0.1)]), NOW).column).toBe("en_curso");
    }
  });

  it("precedencia: Te necesita > En curso > Esperando al cliente > Al día", () => {
    expect(classifyProject("p1", data([req("esperando_cliente", 1), req("interpretando", 0.1)]), NOW).column).toBe("en_curso");
    expect(classifyProject("p1", data([req("interpretando", 0.1), req("esperando_agencia", 30)]), NOW).column).toBe("te_necesita");
    expect(classifyProject("p1", data([req("publicado", 1), req("respondido", 2)]), NOW).column).toBe("al_dia");
  });

  it("dentro de Te necesita gana lo más viejo", () => {
    const a = req("esperando_agencia", 2);
    const b = req("esperando_agencia", 40);
    expect(classifyProject("p1", data([a, b]), NOW).item?.requestId).toBe(b.id);
  });

  it("una versión viva con git_error y sin commit va a Te necesita", () => {
    const v: AttVersion = { id: "v1", project_id: "p1", status: "viva", git_error: "timeout", git_commit_sha: null, created_at: ago(1), request_short_id: "X" };
    expect(classifyProject("p1", data([req("publicado", 1)], [], [v]), NOW).item?.kind).toBe("commit_fallido");
    expect(classifyProject("p1", data([req("publicado", 1)], [], [{ ...v, status: "reemplazada" }]), NOW).column).toBe("al_dia");
    expect(classifyProject("p1", data([req("publicado", 1)], [], [{ ...v, git_commit_sha: "abc" }]), NOW).column).toBe("al_dia");
  });

  it("Al día muestra el último pedido, o nada si no hay", () => {
    const last = req("publicado", 1);
    expect(classifyProject("p1", data([req("publicado", 10), last]), NOW).item?.requestId).toBe(last.id);
    expect(classifyProject("p1", data([]), NOW)).toMatchObject({ column: "al_dia", item: null });
  });
});

describe("derivados y bloqueados", () => {
  it("cuentan si son de los últimos 7 días y no hubo un publicado después", () => {
    const d = req("derivado", 30);
    expect(isOpenHandoff(d, [d], NOW)).toBe(true);
    expect(classifyProject("p1", data([d]), NOW).item?.kind).toBe("derivado");
  });

  it("no cuentan si son viejos", () => {
    const d = req("bloqueado", 24 * 8);
    expect(classifyProject("p1", data([d]), NOW).column).toBe("al_dia");
  });

  it("no cuentan si después se publicó otro pedido del proyecto", () => {
    const d = req("derivado", 30);
    const fix = req("publicado", 20);
    expect(classifyProject("p1", data([d, fix]), NOW).column).toBe("al_dia");
    // Un publicado anterior no lo resuelve.
    expect(classifyProject("p1", data([req("publicado", 40), d]), NOW).column).toBe("te_necesita");
  });
});

describe("buildBoard", () => {
  it("pone cada proyecto en una sola columna y ordena Te necesita del más viejo al más nuevo", () => {
    const board = buildBoard(
      ["p1", "p2", "p3", "p4"],
      data([req("esperando_agencia", 2, "p1"), req("esperando_agencia", 50, "p2"), req("publicado", 3, "p3"), req("interpretando", 0, "p3")]),
      NOW,
    );
    expect(board.te_necesita.map((p) => p.projectId)).toEqual(["p2", "p1"]);
    expect(board.en_curso.map((p) => p.projectId)).toEqual(["p3"]);
    expect(board.al_dia.map((p) => p.projectId)).toEqual(["p4"]);
    const all = Object.values(board).flat().map((p) => p.projectId);
    expect(new Set(all).size).toBe(all.length);
  });
});
