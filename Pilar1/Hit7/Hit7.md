Hit #7: HASH por fuerza bruta con CUDA (con límites)
Se modificó el programa del Hit #5 para aceptar dos parámetros adicionales: el inicio y el fin del rango de búsqueda. El programa ahora solo prueba nonces dentro de ese intervalo y detiene la búsqueda al llegar al límite superior, sin seguir iterando indefinidamente.

Se probaron dos casos:
Caso 1: rango [0, 20000] con prefijo "0000": El programa encontró el nonce 16374 con hash 000084c5c023d52aea111d3da5ccce3e, resultado consistente con los hits anteriores.
Caso 2: rango [0, 1000] con prefijo "0000": El programa recorrió todo el rango sin encontrar ningún nonce válido e informó que no había solución en ese intervalo, comportándose correctamente ante la ausencia de resultados.