$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'

function Test-TcpPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $connection.Wait(1000)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

$postgresReady = Test-TcpPort 5432

if (-not $postgresReady) {
    $service = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $service) {
        throw 'PostgreSQL no esta instalado en este equipo.'
    }

    if ($service.Status -ne 'Running') {
        try {
            Start-Service -Name $service.Name
        } catch {
            $startCommand = "Start-Service -Name '$($service.Name)'"
            Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $startCommand
        }
        Start-Sleep -Seconds 3
    }

    $postgresReady = Test-TcpPort 5432
    if (-not $postgresReady) {
        throw 'PostgreSQL no respondio en el puerto 5432.'
    }
}

$appReady = Test-TcpPort 3000
if (-not $appReady) {
    Start-Process node.exe -ArgumentList 'server.js' -WorkingDirectory $backend -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $backend 'server.out.log') `
        -RedirectStandardError (Join-Path $backend 'server.err.log')

    for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2
            if ($health.status -eq 'ok') { break }
        } catch {
            if ($attempt -eq 14) {
                throw 'AquaControl no pudo iniciar. Revisa backend/server.err.log.'
            }
        }
    }
}

Start-Process 'http://localhost:3000'
Write-Host 'AquaControl esta disponible en http://localhost:3000'
