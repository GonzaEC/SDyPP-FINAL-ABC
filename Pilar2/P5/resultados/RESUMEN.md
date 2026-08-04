# Matriz de pruebas de carga — resultados crudos

Arnés: `Pilar2/P5/loadtest.py` (mints ECDSA reales contra el NCT).
Stack: docker compose raíz. Métrica: **time-to-confirm** (submitted → CONFIRMED).
CSVs con datos por transacción en este directorio.

Fecha: 2026-08-04.

## Efecto de la fragmentación del pool (20 tx por lote, dificultad 4, 30 tx)

El TrP subdivide la tarea en `ceil(TOTAL/CHUNK_SIZE)` chunks. Cada corrida dejó
`TRP_CHUNK_SIZE` en 2.5M (25% del rango) o 1M (10%).

| Fragmentación (chunk) | Workers | avg ttc (s) | p50 (s) | p95 (s) | Mejora vs chunk 25% |
|---|---|---|---|---|---|
| 25% (2.5M) | 1 | 17.74 | 17.71 | 30.63 | 1.00× |
| 10% (1.0M) | 1 | 3.51 | 3.38 | 3.77 | 5.05× |
| 10% (1.0M) | 2 | 4.37 | 4.52 | 4.98 | — (sin mejora con M=2) |
| 25% (2.5M) | 2 | 8.32 | 8.33 | 9.68 | 2.13× |

## Lectura de los datos

- **Fragmentar el chunk es el palanca dominante.** Con un solo worker, bajar el
  chunk de 25% → 10% del rango acelera 5×: cada subtarea termina antes, se acredita
  el `_published_at` más pronto y el minado de un bloque no se serializa en un
  único rango largo.
- **Agregar workers paga solo con chunks grandes.** Con chunk 25%, pasar de
  M=1 → M=2 casi duplicó el throughput (17.7 → 8.3s). Con chunk 10%, M=2 **no
  mejoró** (3.5 → 4.4s, incluso peor por overhead): el chunk ya es tan chico que
  un worker basta, y el segundo agrega latencia de distribución o colisión.
  Esto es el trade-off clásico del pool: demasiada fragmentación sin más workers
  no escala porque satura el NCtTrP, demasiado chunk desperdicia capacidad paralela.
- **La dificultad es cuello de botella independiente** (dificultad 5 hace s altos
  sin importar workers). Para §7: separar "dificultad del PoW" de "fragmentación".

## Corridas inválidas descartadas

- `fracc_chunk250k_m2_*`: la env `TRP_CHUNK_SIZE` no se propagó en ese `up`
  (proceso bash aparte); el contenedor corrió con el default 2.5M. Se eliminó el CSV.
- Corridas con dificultad 6 en worker-cpu: el chunk de 2.5M no encuentra solución
  con 6 ceros (~15% por chunk), los chunks se agotan (65s c/u) sin éxito → loops
  largos. Documenta el límite práctico de CPU con prefijos ≥6.