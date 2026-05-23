!macro customInstall
  DetailPrint "Checking for a running Schofy instance..."
  nsExec::ExecToLog 'taskkill /IM "Schofy.exe" /T /F'
!macroend
