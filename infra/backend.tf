# State local por simplicidad. Para CI/CD el pipeline commitea el tfstate al
# repo (bloqueado con concurrency: infra en pipeline-1). Si mas adelante queremos
# state compartido, migrar a OCI Object Storage con backend "http" apuntando al
# Pre-Authenticated Request (PAR) del bucket.
terraform {
}
