# Pilar 1 — Programación GPU con CUDA

Módulo progresivo de programación paralela en GPU usando CUDA C, con MD5 brute-force
como caso de estudio. Todos los notebooks corren en Google Colab (Tesla T4).

## Progresión de hitos

| Hit | Tema | Archivos |
|-----|------|----------|
| **Hit1** | Setup del entorno CUDA en Colab | `Hit1.md` |
| **Hit2** | "Hello World" en CUDA — bloques, threads, sincronización | `Hit2.md`, `Hit2.ipynb` |
| **Hit3** | Bibliotecas CUDA: CCCL y Thrust (`host_vector`/`device_vector`) | `Hit3.md`, `Hit3.ipynb` |
| **Hit4** | Implementación de MD5 en CUDA vs Python | `Hit4.md`, `Hit4CUDA.ipynb`, `Hit4PYTHON.ipynb` |
| **Hit5** | Brute-force de nonce sin límite (PoW básico) | `Hit5.md`, `Hit5CUDA.ipynb`, `Hit5PYTHON.ipynb` |
| **Hit6** | Benchmark: tiempo vs longitud de prefijo | `Hit6.md`, `Hit6.ipynb` |
| **Hit7** | Brute-force con rango acotado `[start, end]` | `Hit7.md`, `Hit7.ipynb` |

## Cierre — Análisis comparativo GPU vs CPU

En `Cierre Etapa Inicial/`:

- `Analisis.md` — Análisis de resultados.
- `BateriaTests.ipynb` — Batería de tests GPU vs CPU.

**Hallazgo clave:** para prefijos de 1-2 caracteres, la CPU gana por el overhead del kernel
launch de CUDA. A partir de 3-4 caracteres, la GPU domina, alcanzando **128x de speedup**
con prefijo de 6 caracteres. Esto demuestra concretamente por qué las blockchains usan GPUs
para Proof of Work.

## Relación con el sistema

El trabajo de Pilar 1 es la base teórica y práctica de los **workers GPU** que minan bloques
en el sistema final. El binario CUDA compilado (`minero_sm*`) que produce Hit5/Hit7 es el
mismo que usa el `gpu-server.py` de Pilar 2 para encontrar nonces válidos.

## Cómo ejecutar

1. Abrir cualquier `.ipynb` en Google Colab.
2. Seleccionar runtime con GPU (T4).
3. Ejecutar todas las celdas.
