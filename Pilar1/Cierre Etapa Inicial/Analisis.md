Cierre Etapa Inicial — Comparativa GPU vs CPU
Se ejecutó una batería de tests con distintas cadenas base y longitudes de prefijo, midiendo el tiempo en GPU (CUDA) y CPU (Python).

Base        Prefijo Nonce       Tiempo GPU    Tiempo CPU    Speedup
hola mundo  0       0           0.85 ms       0.02 ms       0.02x
hola mundo  00      42          0.92 ms       0.06 ms       0.07x
hola mundo  000     5.519       0.92 ms       6.01 ms       6.5x
hola mundo  0000    16.374      0.91 ms       17.20 ms      18.9x
hola mundo  00000   105.281     1.78 ms       115.41 ms     64.8x
hola mundo  000000  1.736.235   15.05 ms      1919.94 ms    127.6x
blockchain  0       2           0.86 ms       0.01 ms       0.01x
blockchain  0000    10.941      0.94 ms       12.38 ms      13.2x
blockchain  00000   93.857      1.62 ms       182.08 ms     112.4x

Análisis:
Para prefijos cortos (1-2 caracteres) la CPU es más rápida que la GPU. Esto se debe a que el overhead de lanzar un kernel CUDA (reservar memoria, transferir datos, sincronizar) supera el tiempo de cómputo real cuando la solución se encuentra en muy pocos intentos.
A partir de prefijo de 3-4 caracteres la GPU empieza a ganar, y la ventaja crece exponencialmente con la longitud del prefijo. Con 6 caracteres la GPU es ~128 veces más rápida que la CPU. Esto ilustra perfectamente por qué las blockchains reales usan GPU para minería: a medida que aumenta la dificultad (prefijos más largos), el paralelismo masivo de la GPU se vuelve cada vez más determinante.