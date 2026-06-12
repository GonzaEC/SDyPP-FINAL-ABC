Hit #2: Hola Mundo en CUDA
El objetivo fue escribir el programa más simple posible que use tanto la CPU como la GPU, para verificar que el entorno funciona y entender la estructura básica de un programa CUDA.
El programa lanza un kernel (helloFromGPU) con 2 bloques de 4 hilos cada uno, totalizando 8 hilos corriendo en paralelo en la GPU. Cada hilo imprime su número de bloque e hilo. La CPU imprime su propio mensaje antes de lanzar el kernel, y cudaDeviceSynchronize() hace que la CPU espere a que todos los hilos de la GPU terminen antes de salir.
La salida mostró los 8 hilos ejecutándose correctamente. El orden puede variar entre ejecuciones porque los hilos corren en paralelo, sin garantía de orden.
No se encontraron inconvenientes durante la configuración del entorno ni durante la compilación y ejecución del programa.
