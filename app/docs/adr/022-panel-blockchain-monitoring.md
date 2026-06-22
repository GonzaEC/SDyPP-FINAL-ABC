# ADR-022: Panel de monitoreo blockchain integrado en la app

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

Para la defensa del TP necesitamos mostrar en tiempo real qué pasa en la blockchain: bloques
minados, transacciones, dificultad, estado del minado. Sin un panel, la única forma de ver
esto es via `kubectl exec` + `curl`, que no es presentable.

## Decisión

Creamos una página pública `/panel` dentro de la app Next.js que muestra:

1. **Status cards**: bloques totales, dificultad, TX pendientes, estado de minado.
2. **Block explorer**: lista de bloques expandibles (newest-first) con hash, nonce,
   timestamp y transacciones.
3. **Event log**: timeline de eventos del sistema con dots de color por tipo.

La página hace polling cada 5 segundos a `/api/blockchain`, que es un proxy al NCT
(`/status`, `/blockchain`, `/logs` en paralelo).

## Consecuencias

### Positivas
- Visibilidad completa de la blockchain desde el browser, sin acceso al cluster.
- Público (sin auth), ideal para la defensa y para que el evaluador explore.
- Auto-refresh — se ven los bloques nuevos apareciendo en tiempo real.

### Negativas
- Polling cada 5s genera tráfico constante al NCT (despreciable para 2 réplicas).

### Abiertas
- Se podría migrar a WebSocket/SSE para updates push en vez de polling.

## Alternativas consideradas

### A. Grafana + Prometheus
Más potente, pero requiere instalar y configurar dos servicios más en el cluster.
Overkill para el TP y consume recursos que no tenemos en nodos e2-medium.

### B. Script CLI que formatea los logs
Funcional pero no presentable para la defensa. No accesible desde el browser.
