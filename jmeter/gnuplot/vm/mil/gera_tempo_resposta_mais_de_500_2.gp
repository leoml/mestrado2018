reset

set terminal png size 1280,720 font 'Verdana,12'


# Data transforming 
# Tab separated values
set datafile separator ","            # Usinf "," to separete 

set xdata time                        # Turns on time-series mode
set timefmt "%Y-%m-%d %H:%M:%S"
set format x "%H:%M"


# Plot formating 
set ylabel "Tempo de resposta (ms)"
set xlabel "Divisão em minutos\nMomento de execução do teste" 
#set format y "%.2f"
set title "Tempo de Resposta - Bateria BT-1 VM"
set grid

set bmargin 5
set key top left box

set ytics 100

# TESTE
set yrange  [0<*<500:500<*<2500]
plot 'HTTP-teste-table-mil.csv'  u (strcol(1)):(($2+$14))  with filledcurves  t "Tempo de Resposta"  

