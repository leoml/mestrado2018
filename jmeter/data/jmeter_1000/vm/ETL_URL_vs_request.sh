#!/bin/bash 
# Script gera estatístiacs de requisições.

cat jmeter_report_1000.csv |awk -F"," '{print $14}' |sed -e 's@http://cdn-fe-lb-507999201.us-east-1.elb.amazonaws.com/@@' >./url_statistics.txt
sed -i '1d' ./url_statistics.txt
cat url_statistics.txt |sort | uniq -c >./saida_url_static.txt
gnuplot ./gera_grafico_distribuicao_de_requisicoes.gp > url_saida.png
