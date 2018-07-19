#!/bin/bash

#Gera estatistica de tempo maior que 500 mili segundos. 
gnuplot gera_tempo_resposta_mais_de_500.gp >jmeter_10000_vm_gera_tempo_resposta_mais_de_500.png

#Gera estatistica de tempo maior que 500 mili segundos. 
gnuplot gera_tempo_resposta_menos_de_100.gp >jmeter_10000_vm_gera_tempo_resposta_menos_de_100.png

# Gera estatistica
gnuplot gera_tempo_de_resposta_e_media.gp  >jmeter_10000_vm_tempo_de_resposta_e_media.png

# Transforma arquivo e gera estatisticas de distribuição de cargas
cat jmeter_report_10000.csv |awk -F"," '{print $14}' | sed -e 's@http://cdn-fe-lb-507999201.us-east-1.elb.amazonaws.com/@@'>./saida_url_statistics.txt 

# Remove cabeçalho
sed -i '1d' ./saida_url_statistics.txt

# Cria rank de paginas
cat ./saida_url_statistics.txt |sort | uniq -c >./saida_url_source_plot_pre.txt

# Formata arquivo
cat ./saida_url_source_plot_pre.txt |awk -F" " '{print $1","$2}'>./saida_url_source_plot.txt

# Gera gráfico estatisticas
gnuplot ./gera_grafico_distribuicao_de_requisicoes.gp >jmeter_10000_vm_distribuição_url_saida.png

