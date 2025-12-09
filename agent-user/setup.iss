[Setup]
AppId={{D37F8C86-5381-4D6F-9C1D-8F7B5A4E0E2C}
AppName=Visun Agent User
AppVersion=1.0
AppPublisher=Visun
DefaultDirName={autopf}\Visun Agent User
DefaultGroupName=Visun Agent User
OutputDir=.
OutputBaseFilename=VisunAgentUserSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Run automatically on startup"; GroupDescription: "Additional tasks"

[Files]
; The main executable
Source: "dist\visun-agent-user.exe"; DestDir: "{app}"; Flags: ignoreversion

; NOTE: network_vulnscan.py is referenced in sender.py. 
; If it is not bundled in the EXE, it should be included here.
; Source: "functions\network_vulnscan.py"; DestDir: "{app}\functions"; Flags: ignoreversion

[Icons]
Name: "{group}\Visun Agent User"; Filename: "{app}\visun-agent-user.exe"
Name: "{group}\{cm:UninstallProgram,Visun Agent User}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Visun Agent User"; Filename: "{app}\visun-agent-user.exe"; Tasks: desktopicon
Name: "{userstartup}\Visun Agent User"; Filename: "{app}\visun-agent-user.exe"; Tasks: startup

[Run]
Filename: "{app}\visun-agent-user.exe"; Description: "{cm:LaunchProgram,Visun Agent User}"; Flags: nowait postinstall skipifsilent

[Code]
var
  AgentIdPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  AgentIdPage := CreateInputQueryWizardPage(wpWelcome,
    'Agent Configuration', 'Please enter the Agent configuration details.',
    'These details are required for the agent to connect to the central server.');
  
  AgentIdPage.Add('Agent ID:', False);
  AgentIdPage.Add('Server URL (e.g., http://192.168.1.10:5000):', False);
  
  ; Set default values if needed
  AgentIdPage.Edits[0].Text := ExpandConstant('{computername}');
  AgentIdPage.Edits[1].Text := 'http://localhost:5000';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AgentID, ServerURL, EnvContent: String;
  EnvFilePath: String;
begin
  if CurStep = ssPostInstall then
  begin
    AgentID := AgentIdPage.Edits[0].Text;
    ServerURL := AgentIdPage.Edits[1].Text;
    
    EnvContent := 'AGENT_ID=' + AgentID + #13#10 +
                  'SERVER_URL=' + ServerURL + #13#10;
                  
    EnvFilePath := ExpandConstant('{app}\.env');
    
    if not SaveStringToFile(EnvFilePath, EnvContent, False) then
      MsgBox('Failed to create configuration file (.env). The agent may not work correctly.', mbError, MB_OK);
  end;
end;
