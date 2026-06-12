Hit #4: Introducción a HASH usando CUDA

Se implementaron dos versiones de cálculo de MD5: una en GPU usando CUDA y otra en CPU usando Python.
La versión CUDA implementa el algoritmo MD5 directamente en un kernel de la GPU. El programa recibe un string por parámetro, lo transfiere a memoria de la GPU con cudaMalloc y cudaMemcpy, ejecuta el cálculo del hash en un kernel, y devuelve el resultado copiándolo de vuelta a la CPU para mostrarlo por consola.
La versión Python utiliza la biblioteca estándar hashlib, que implementa MD5 en CPU.
Al ejecutar ambas versiones con el mismo input "hola mundo", las dos produjeron el mismo hash: 0ad066a5d29f3f2a2a1c7c17dd082a79, lo que verifica que la implementación CUDA es correcta.
