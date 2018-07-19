reset
# 
set terminal png size 1280,720 font 'Verdana,12'

set datafile separator ","  

# Plot formating
set ylabel "Número de requisições/URL"
set xlabel "URL de teste"
set title "Distribuição de requisições - Bateria BT-3 CT"
set grid y
set key font ",10"

set style fill solid 0.5 border -1
set border 3 front linetype black linewidth 1.0 dashtype solid
set bmargin 8

#TESTE
set xtics rotate by 60 right
set format y "%.2f"

set key off

plot 'saida_url_source_plot.txt' u 1:xtic(2) with impulses lw 20 lc "blue"


