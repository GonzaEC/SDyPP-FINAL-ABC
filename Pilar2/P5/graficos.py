#!/usr/bin/env python3
"""Genera los graficos comparativos del informe a partir de los CSV crudos.

Lee `resultados/*.csv` (salida de loadtest.py) y escribe PNGs en
`resultados/graficos/`. Se corre offline, no necesita el stack levantado:

  pip install matplotlib
  python Pilar2/P5/graficos.py

Cada CSV tiene una fila por transaccion con columnas
`batch,op_id,status,ttc_s,difficulty`, y el nombre del archivo codifica la
configuracion de la corrida (workers, fragmentacion del chunk, dificultad).

Los cuatro graficos responden a lo que pide el checklist en §7:
  1. fragmentacion.png  - efecto del tamano de chunk y de M workers
  2. dificultad.png     - time-to-confirm segun longitud del prefijo
  3. distribucion.png   - dispersion, que los promedios de las tablas esconden
  4. evolucion.png      - ttc a lo largo del lote, para ver si hay encolamiento
"""
import csv
import re
import statistics
import sys
from pathlib import Path

try:
    import matplotlib
    matplotlib.use("Agg")  # sin display: escribimos archivos, no ventanas
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit("Falta matplotlib. Instalalo con: pip install matplotlib")

RESULTADOS = Path(__file__).parent / "resultados"
SALIDA = RESULTADOS / "graficos"

# Paleta consistente entre graficos: el numero de workers define el color y la
# fragmentacion la intensidad, para que se lean juntos sin leyenda cruzada.
COLOR_M1 = "#2563eb"
COLOR_M2 = "#ea580c"
COLOR_EXTRA = "#059669"


def leer_csv(path: Path) -> tuple[list[float], int, int]:
    """Devuelve (ttc de las CONFIRMED, total de filas, cuantas no confirmaron).

    Las no-CONFIRMED importan: en dificultad 5 con un solo worker hay TIMEOUTs,
    y promediar solo las exitosas esconderia que el 7.5% del lote no entro nunca
    a la cadena. El conteo se reporta aparte en los graficos.
    """
    with path.open(encoding="utf-8") as fh:
        filas = list(csv.DictReader(fh))
    confirmadas = [
        float(f["ttc_s"]) for f in filas
        if f.get("status") == "CONFIRMED" and f.get("ttc_s")
    ]
    return confirmadas, len(filas), len(filas) - len(confirmadas)


def stats(valores: list[float]) -> dict:
    """avg / p50 / p95. Con menos de 2 muestras los percentiles no aplican."""
    if not valores:
        return {"avg": 0.0, "p50": 0.0, "p95": 0.0, "n": 0}
    ordenados = sorted(valores)
    # Indice del p95 por posicion (no interpolado): con n=30 es el elemento 28.
    idx95 = min(len(ordenados) - 1, int(round(0.95 * (len(ordenados) - 1))))
    return {
        "avg": statistics.fmean(valores),
        "p50": statistics.median(valores),
        "p95": ordenados[idx95],
        "n": len(valores),
    }


def cargar_corridas() -> dict[str, dict]:
    """Indexa los CSV parseando la configuracion desde el nombre del archivo."""
    corridas = {}
    for path in sorted(RESULTADOS.glob("*.csv")):
        nombre = path.stem
        datos, total, fallidas = leer_csv(path)
        if not datos:
            print(f"  aviso: {path.name} sin filas CONFIRMED, lo salteo")
            continue

        info = {"archivo": path.name, "ttc": datos, "total": total,
                "fallidas": fallidas, **stats(datos)}

        # c_m1_chunk10pct_d4_30 -> workers=1, chunk=10%, dificultad=4
        m = re.match(r"c_m(\d+)_chunk(\d+)pct_d(\d+)_(\d+)", nombre)
        if m:
            info.update(tipo="fragmentacion", workers=int(m[1]), chunk_pct=int(m[2]),
                        dificultad=int(m[3]), n_tx=int(m[4]))
            corridas[nombre] = info
            continue

        # matiz_m2_d5_40 -> workers=2, dificultad=5
        m = re.match(r"matiz_m(\d+)_d(\d+)_(\d+)", nombre)
        if m:
            info.update(tipo="dificultad", workers=int(m[1]), dificultad=int(m[2]),
                        n_tx=int(m[3]))
            corridas[nombre] = info
            continue

        # fracc_chunk250k_m1_d5_40 -> chunk absoluto, no porcentual
        m = re.match(r"fracc_chunk(\w+)_m(\d+)_d(\d+)_(\d+)", nombre)
        if m:
            info.update(tipo="chunk_absoluto", chunk=m[1], workers=int(m[2]),
                        dificultad=int(m[3]), n_tx=int(m[4]))
            corridas[nombre] = info
            continue

        print(f"  aviso: no supe interpretar el nombre {path.name}")
    return corridas


def grafico_fragmentacion(corridas: dict) -> None:
    """El hallazgo central: fragmentar el chunk pesa mas que sumar workers."""
    configs = [
        ("c_m1_chunk25pct_d4_30", "chunk 25%\nM=1", COLOR_M1),
        ("c_m2_chunk25pct_d4_30", "chunk 25%\nM=2", COLOR_M2),
        ("c_m1_chunk10pct_d4_30", "chunk 10%\nM=1", COLOR_M1),
        ("c_m2_chunk10pct_d4_30", "chunk 10%\nM=2", COLOR_M2),
    ]
    presentes = [(k, lbl, c) for k, lbl, c in configs if k in corridas]
    if not presentes:
        return

    fig, ax = plt.subplots(figsize=(9, 5.5))
    x = range(len(presentes))
    avgs = [corridas[k]["avg"] for k, _, _ in presentes]
    p95s = [corridas[k]["p95"] for k, _, _ in presentes]
    colores = [c for _, _, c in presentes]

    barras = ax.bar(x, avgs, color=colores, width=0.6, label="promedio")
    # El p95 va como marca sobre la barra: muestra la cola sin un segundo eje.
    ax.scatter(x, p95s, color="#111827", zorder=3, marker="_", s=600, linewidths=2.5)

    for i, (avg, p95) in enumerate(zip(avgs, p95s)):
        ax.text(i, avg / 2, f"{avg:.1f}s", ha="center", va="center",
                color="white", fontweight="bold")
        ax.text(i, p95 + 0.6, f"p95 {p95:.1f}s", ha="center", fontsize=9, color="#374151")

    ax.set_xticks(list(x))
    ax.set_xticklabels([lbl for _, lbl, _ in presentes])
    ax.set_ylabel("Time-to-confirm (s)")
    ax.set_title("Efecto de la fragmentacion del pool y del numero de workers\n"
                 "(30 transacciones, dificultad 4)", fontsize=12)
    ax.grid(axis="y", alpha=0.25)
    ax.set_axisbelow(True)

    # Anotacion del hallazgo, que es el punto del grafico.
    if "c_m1_chunk25pct_d4_30" in corridas and "c_m1_chunk10pct_d4_30" in corridas:
        mejora = corridas["c_m1_chunk25pct_d4_30"]["avg"] / corridas["c_m1_chunk10pct_d4_30"]["avg"]
        ax.annotate(f"Bajar el chunk de 25% a 10%\nacelera {mejora:.1f}x con un solo worker",
                    xy=(2, avgs[2]), xytext=(2.4, max(avgs) * 0.62),
                    fontsize=9.5, color="#111827",
                    arrowprops=dict(arrowstyle="->", color="#6b7280"))

    fig.tight_layout()
    fig.savefig(SALIDA / "fragmentacion.png", dpi=140)
    plt.close(fig)
    print("  fragmentacion.png")


def grafico_dificultad(corridas: dict) -> None:
    """Time-to-confirm segun la longitud del prefijo exigido."""
    series = {}
    for info in corridas.values():
        if info["tipo"] != "dificultad":
            continue
        series.setdefault(info["workers"], []).append((info["dificultad"], info))
    if not series:
        return

    fig, ax = plt.subplots(figsize=(9.5, 6))
    todas_las_dif = sorted({d for puntos in series.values() for d, _ in puntos})

    for workers, puntos in sorted(series.items()):
        puntos.sort(key=lambda p: p[0])
        xs = [d for d, _ in puntos]
        color = COLOR_M1 if workers == 1 else COLOR_M2

        # La mediana es la serie principal: en dificultad 5 con M=1 el promedio
        # (251s) triplica a la mediana (84s) por unas pocas corridas larguisimas.
        # Graficar solo el promedio haria parecer tipico algo que no lo es.
        medianas = [i["p50"] for _, i in puntos]
        promedios = [i["avg"] for _, i in puntos]

        # Tramo punteado si faltan dificultades intermedias medidas: evita
        # sugerir una progresion lineal donde no hay datos.
        continuo = xs == [d for d in todas_las_dif if d >= xs[0] and d <= xs[-1]]
        ax.plot(xs, medianas, marker="o", color=color, linewidth=2.2,
                linestyle="-" if continuo else "--",
                label=f"M={workers} — mediana" + ("" if continuo else " (sin medir d=4)"))
        ax.plot(xs, promedios, marker="^", color=color, linewidth=1,
                linestyle=":", alpha=0.75, label=f"M={workers} — promedio")

        for d, i in puntos:
            ax.annotate(f"{i['p50']:.1f}s", xy=(d, i["p50"]), xytext=(0, -16),
                        textcoords="offset points", ha="center", fontsize=9, color=color)
            if i["fallidas"]:
                pct = 100 * i["fallidas"] / i["total"]
                ax.annotate(f"{i['fallidas']}/{i['total']} TIMEOUT ({pct:.0f}%)",
                            xy=(d, i["avg"]), xytext=(-12, 10),
                            textcoords="offset points", ha="right", fontsize=9,
                            color="#b91c1c", fontweight="bold")

    ax.set_xlabel("Dificultad (ceros de prefijo exigidos)")
    ax.set_ylabel("Time-to-confirm (s, escala logaritmica)")
    ax.set_yscale("log")  # el rango va de ~3s a ~250s: lineal aplasta todo abajo
    ax.set_title("Costo del minado segun la longitud del prefijo\n"
                 "(mediana en linea llena, promedio punteado)", fontsize=12)
    ax.grid(alpha=0.25, which="both")
    ax.set_axisbelow(True)
    ax.legend(fontsize=9, loc="upper left")
    # Enteros en el eje x: la dificultad es un conteo de caracteres.
    ax.set_xticks(todas_las_dif)

    fig.tight_layout()
    fig.savefig(SALIDA / "dificultad.png", dpi=140)
    plt.close(fig)
    print("  dificultad.png")


def grafico_distribucion(corridas: dict) -> None:
    """Boxplot: la dispersion que los promedios de las tablas no muestran."""
    configs = [
        ("c_m1_chunk25pct_d4_30", "25% M=1"),
        ("c_m2_chunk25pct_d4_30", "25% M=2"),
        ("c_m1_chunk10pct_d4_30", "10% M=1"),
        ("c_m2_chunk10pct_d4_30", "10% M=2"),
    ]
    presentes = [(k, lbl) for k, lbl in configs if k in corridas]
    if not presentes:
        return

    fig, ax = plt.subplots(figsize=(9, 5.5))
    datos = [corridas[k]["ttc"] for k, _ in presentes]
    bp = ax.boxplot(datos, tick_labels=[lbl for _, lbl in presentes],
                    patch_artist=True, medianprops=dict(color="#111827", linewidth=2))
    for parche, (k, _) in zip(bp["boxes"], presentes):
        parche.set_facecolor(COLOR_M1 if corridas[k]["workers"] == 1 else COLOR_M2)
        parche.set_alpha(0.65)

    ax.set_ylabel("Time-to-confirm (s)")
    ax.set_title("Dispersion del time-to-confirm por configuracion\n"
                 "(30 transacciones, dificultad 4)", fontsize=12)
    ax.grid(axis="y", alpha=0.25)
    ax.set_axisbelow(True)

    fig.tight_layout()
    fig.savefig(SALIDA / "distribucion.png", dpi=140)
    plt.close(fig)
    print("  distribucion.png")


def grafico_evolucion(corridas: dict) -> None:
    """ttc transaccion a transaccion: revela encolamiento o degradacion."""
    configs = [
        ("c_m1_chunk25pct_d4_30", "chunk 25% M=1", COLOR_M1),
        ("c_m2_chunk25pct_d4_30", "chunk 25% M=2", COLOR_M2),
        ("c_m1_chunk10pct_d4_30", "chunk 10% M=1", COLOR_EXTRA),
    ]
    presentes = [(k, lbl, c) for k, lbl, c in configs if k in corridas]
    if not presentes:
        return

    fig, ax = plt.subplots(figsize=(9, 5.5))
    for k, lbl, color in presentes:
        ys = corridas[k]["ttc"]
        ax.plot(range(1, len(ys) + 1), ys, marker=".", color=color,
                linewidth=1.4, label=lbl, alpha=0.9)

    ax.set_xlabel("Transaccion dentro del lote")
    ax.set_ylabel("Time-to-confirm (s)")
    ax.set_title("Evolucion del time-to-confirm a lo largo del lote", fontsize=12)
    ax.grid(alpha=0.25)
    ax.set_axisbelow(True)
    ax.legend()

    fig.tight_layout()
    fig.savefig(SALIDA / "evolucion.png", dpi=140)
    plt.close(fig)
    print("  evolucion.png")


def main() -> int:
    if not RESULTADOS.is_dir():
        sys.exit(f"No encuentro {RESULTADOS}")
    SALIDA.mkdir(exist_ok=True)

    print(f"Leyendo CSVs de {RESULTADOS}")
    corridas = cargar_corridas()
    if not corridas:
        sys.exit("No se pudo leer ninguna corrida")
    print(f"{len(corridas)} corridas cargadas\n")

    print("Generando graficos:")
    grafico_fragmentacion(corridas)
    grafico_dificultad(corridas)
    grafico_distribucion(corridas)
    grafico_evolucion(corridas)

    print(f"\nListo. PNGs en {SALIDA}")
    print("\nResumen de lo leido:")
    for nombre, i in sorted(corridas.items()):
        print(f"  {nombre:34s} n={i['n']:3d}/{i['total']:3d}  avg={i['avg']:7.2f}s  "
              f"p50={i['p50']:7.2f}s  p95={i['p95']:7.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
