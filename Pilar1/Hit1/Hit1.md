Hit #1: Configuración del Entorno
Como no contamos con una placa NVIDIA local, elegimos Google Colab como entorno de trabajo.
Colab es una plataforma web gratuita de Google que ofrece acceso a GPUs con CUDA preinstalado, sin necesidad de instalar nada localmente.
Para verificar que el entorno estaba listo ejecutamos nvcc --version y nvidia-smi.
El resultado confirmó que tenemos CUDA 12.8 disponible y una GPU Tesla T4 con 15GB de memoria asignada.
Notamos que CUDA no es una sola cosa, sino una cadena de componentes: el driver (que habla con el hardware), el compilador nvcc (que traduce el código CUDA a instrucciones de la GPU), y el runtime. Para que todo funcione correctamente, las versiones de cada componente deben ser compatibles entre sí. En Colab esto viene resuelto de fábrica.
