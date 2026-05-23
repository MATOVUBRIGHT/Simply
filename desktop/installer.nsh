!macro customInit
  DetailPrint "Closing any running Schofy instance before setup starts..."
  nsExec::ExecToLog 'taskkill /IM "Schofy.exe" /T /F'
  Sleep 2000
!macroend

!macro customInstall
  DetailPrint "Checking for a running Schofy instance..."
  nsExec::ExecToLog 'taskkill /IM "Schofy.exe" /T /F'
  Sleep 1000
!macroend
