Hit #6: Longitudes de prefijo en CUDA HASH

Se midió el tiempo de búsqueda para prefijos de 1 a 8 caracteres usando la cadena base "hola mundo":

Prefijo	    Longitud	Nonce encontrado	Tiempo GPU
0	        1	        8.865	            0.79 ms
00	        2	        19.177	            0.87 ms
000	        3	        12.186	            0.82 ms
0000	    4	        16.374	            0.82 ms
00000	    5	        105.281	            1.78 ms
000000	    6	        1.736.235	        15.08 ms
0000000	    7	        56.589.487	        471.54 ms
00000000	8	        762.151.063	        6334.25 ms

Prefijo más largo encontrado: 8 caracteres (00000000), en aproximadamente 6.3 segundos.

Relación entre longitud del prefijo y tiempo: La relación es exponencial. Cada carácter hexadecimal adicional multiplica el espacio de búsqueda por 16, ya que el sistema hexadecimal tiene 16 posibles valores por carácter (0-9, a-f). Esto se refleja claramente en los tiempos: de 5 a 6 caracteres el tiempo se multiplica por ~8, de 6 a 7 por ~31, y de 7 a 8 por ~13. En promedio el factor es cercano a 16 por carácter adicional, consistente con la teoría.

