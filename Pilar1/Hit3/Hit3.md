Hit #3: Librerías CUDA: CCCL y Thrust
¿Qué es CCCL?
CCCL (CUDA Core Compute Libraries) es el repositorio unificado de NVIDIA que consolida las tres bibliotecas de C++ para CUDA que antes vivían por separado: Thrust, CUB y libcudacxx. La idea detrás de esta unificación es ofrecer una experiencia más cohesiva, simplificar el desarrollo y sentar las bases para futuras innovaciones, algo así como lo que es la Standard Library para C++ estándar, pero para el ecosistema CUDA. 
La última actualización del repositorio fue en febrero de 2026, con la versión 0.5.1 del paquete Python cuda-cccl. El repositorio en sí tiene actividad continua con commits y releases frecuentes.

¿Qué es Thrust?
Thrust permite implementar aplicaciones paralelas de alto rendimiento con mínimo esfuerzo, a través de una interfaz de alto nivel completamente interoperable con CUDA C. Provee una colección rica de primitivas de paralelismo de datos como scan, sort y reduce, que pueden combinarse para implementar algoritmos complejos con código conciso y legible. 
El repositorio original github.com/nvidia/thrust fue archivado en marzo de 2024 y Thrust pasó a formar parte de CCCL, donde continúa su desarrollo activo.

Ejemplo de vectores:
No hace falta instalar nada adicional: al instalar el CUDA Toolkit, los headers de Thrust se copian automáticamente al directorio de includes de CUDA. Como Thrust es una biblioteca de templates (solo headers), no requiere ningún paso de instalación adicional para empezar a usarla. 
La compilación y ejecución fueron exitosas sin instalar nada adicional.
La salida muestra que:
•	D[0] y D[2] fueron modificados a 99 y 53 respectivamente desde la GPU
•	D[1] y D[3] conservaron los valores originales copiados desde el host (20 y 46)
Esto confirma que Thrust ya viene incluido con el CUDA Toolkit, no requiere instalación adicional.

CUDA "a pelo" vs Thrust/CCCL
La diferencia fundamental es el nivel de abstracción:
Programar CUDA directamente implica gestionar manualmente todo: cudaMalloc para reservar memoria en la GPU, cudaMemcpy para transferir datos entre CPU y GPU, escribir kernels con __global__ especificando bloques e hilos, y cudaFree para liberar memoria. Es poderoso pero verboso y propenso a errores.
Con Thrust, en cambio, describís tu cómputo en términos de abstracciones de alto nivel y Thrust tiene la libertad de seleccionar la implementación más eficiente automáticamente. Los host_vector y device_vector funcionan igual que std::vector del STL de C++, son contenedores genéricos que pueden almacenar cualquier tipo de dato y redimensionarse dinámicamente, la diferencia es que device_vector vive en memoria de la GPU y host_vector en la CPU, y las transferencias entre ambos se manejan automáticamente. 
En resumen: CUDA a pelo te da control total, Thrust te permite enfocarte en el algoritmo y no en la gestión de memoria y threads.
