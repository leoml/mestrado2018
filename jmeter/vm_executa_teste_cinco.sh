#!/bin/bash

JMETER_BIN="/home/ubuntu/apache-jmeter-4.0/bin/ApacheJMeter.jar" 
JMETER_TEST_PLAN="/jmeter/run_teste/jmeter_5000/vm/AWS_VM_HTTP_Request_cinco_mix.jmx" 
JMETER_CSV="/jmeter/run_teste/jmeter_5000/vm/report/HTTP-teste-table-cinco.csv"
JMETER_HTML="/jmeter/run_teste/jmeter_5000/vm/html/"
JMETER_OPT="-jar -Xms43g -Xmx43g -d64 -server -XX:+UseConcMarkSweepGC -XX:NewSize=128m -XX:MaxNewSize=128m"

/usr/bin/java $JMETER_OPT $JMETER_BIN -f -n -t $JMETER_TEST_PLAN -l $JMETER_CSV -e -o $JMETER_HTML

