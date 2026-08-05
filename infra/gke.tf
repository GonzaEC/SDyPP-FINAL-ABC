resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.zone

  deletion_protection = false

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.gke_subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}

# Node pool para servicios de infraestructura (Redis, RabbitMQ)
resource "google_container_node_pool" "infra" {
  name     = "infra"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  # Cluster Autoscaler. Redis y RabbitMQ son singletons con PVC, así que este
  # pool no crece por demanda de réplicas; el rango 1-2 existe para que el
  # cluster pueda reemplazar el nodo sin downtime (por ejemplo durante un
  # upgrade) en vez de quedarse sin capacidad.
  initial_node_count = 1

  autoscaling {
    min_node_count = 1
    max_node_count = 2
  }

  node_config {
    machine_type = "e2-medium"
    disk_type    = "pd-standard"
    disk_size_gb = 50

    labels = {
      pool = "infra"
    }

    # Este pool NO lleva taint a propósito (decisión de diseño, checklist §3):
    # los addons gestionados de GKE (kube-dns/CoreDNS, metrics-server) solo
    # toleran el taint CriticalAddonsOnly — NO toleran taints definidos por el
    # usuario. Como apps y monitoring SÍ están tainteados, infra queda como la
    # landing zone de esos pods de sistema; si también lo taineáramos, CoreDNS
    # y metrics-server no tendrían nodo donde programarse y se rompería el DNS
    # del cluster. Redis/RabbitMQ siguen guiados a este pool por nodeSelector
    # (separación sugerida), mientras que en apps la separación es impuesta
    # (taint + toleration).

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}

# Node pool para aplicaciones (NCT, TrP, Frontend, Postgres, workers CPU)
resource "google_container_node_pool" "apps" {
  name     = "apps"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  # Cluster Autoscaler. Este es el pool que realmente necesita elasticidad:
  # aloja el frontend y el NCT (ambos con HPA, ver k8s/gke/apps/hpa.yaml) y los
  # worker-cpu, que el TrP escala de golpe cuando cae la GPU. Sin autoscaler,
  # un fallback con varios workers simplemente no tendría dónde programarlos y
  # los pods quedarían Pending.
  #
  # El máximo de 5 es un techo de costo deliberado, no una estimación de carga:
  # son nodos spot, pero igual conviene acotar cuánto puede crecer solo.
  initial_node_count = 2

  autoscaling {
    min_node_count = 2
    max_node_count = 5
  }

  node_config {
    machine_type = "e2-medium"
    spot         = true

    labels = {
      pool = "apps"
    }

    # Taint para IMPONER la separación de pools (checklist §3): sin el taint,
    # el nodeSelector era solo una sugerencia — un pod sin nodeSelector (o con
    # un selector mal escrito) podía aterrizar acá. Con el taint, solo los
    # workloads de apps (frontend, NCT, TrP, worker-cpu, Postgres; todos
    # declaran la toleration) se programan en este pool. Los pods de infra y
    # monitoring no lo toleran. Los DaemonSets de observabilidad (alloy,
    # node-exporter) ya toleran cualquier taint (`operator: Exists`).
    #
    # Nota: infra queda SIN taint de propósito (ver arriba) para que los addons
    # de GKE tengan una landing zone; aquí la separación apps↔infra queda
    # impuesta por el taint + el nodeSelector de cada workload.
    taint {
      key    = "apps"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}

# Node pool dedicado al stack de observabilidad (Prometheus, Grafana, Loki,
# Tempo, Alloy, Alertmanager, exporters).
#
# Por qué un pool aparte y no meterlo en infra/apps:
# - El stack LGTM pide ~2-3 GiB de RAM en total; los nodos infra/apps son
#   e2-medium (4 GiB) y ya están al límite con Redis/RabbitMQ/Postgres/NCT.
#   Apretarlo ahí causaría evicciones y falsos negativos en las propias
#   métricas (el observador no puede competir por recursos con lo observado).
# - on-demand (NO spot): si el nodo se va por preemption perdemos métricas y
#   alertas justo cuando más las necesitamos. Es el único pool que paga
#   on-demand a propósito — es el grueso del costo nuevo de esta feature.
# - El taint impide que cargas de la app se programen acá; solo los pods del
#   namespace observability (que declaran la toleration) aterrizan en este pool.
resource "google_container_node_pool" "monitoring" {
  name     = "monitoring"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  node_count = 1

  node_config {
    machine_type = "e2-standard-2" # 2 vCPU / 8 GiB — holgura para el LGTM
    disk_type    = "pd-standard"
    disk_size_gb = 50

    labels = {
      pool = "monitoring"
    }

    # Solo el stack de observabilidad tolera este taint (ver los manifests en
    # k8s/gke/observability/, todos declaran la toleration correspondiente).
    taint {
      key    = "monitoring"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}
