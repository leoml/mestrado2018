reset

set terminal png size 800,520 font 'Verdana,14'

# Data transforming
# Tab separated values
set datafile separator ","            # Usinf "," to separete

set xdata time                        # Turns on time-series mode
set timefmt "%Y-%m-%d %H:%M:%S"
set format x "%M"

# Plot formating
set ylabel "Tempo de resposta (ms)" font "Verdana, 14"
set xlabel "Divisão em minutos\nMomento de execução do teste" font "Verdana, 14"

#set format y "%.2f"
set title "Tempo de Resposta e Média Tempo de Resposta - Bateria BT-3 CT"
set grid

set bmargin 5
set key top left box
set key font "Verdana, 16"
set ytics 10


set style line 1 linecolor 'green' linetype 1 linewidth 2
set style line 2 linecolor 'red' linetype 1 linewidth 2

set yrange  [0:200]
plot 'HTTP-teste-table-dez.csv'  u 1:($2+$14) smooth csplines  ls 1 t 'Tempo de Resposta', \
 '' u 1:(($2+$14)/2) smooth csplines  ls 2 t 'Média Tempo de Resposta'

