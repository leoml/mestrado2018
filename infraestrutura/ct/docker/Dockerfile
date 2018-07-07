FROM nginx:alpine

MAINTAINER "Leonardo" <leonardoml02@gmail.com>



RUN rm /etc/nginx/conf.d/default.conf
COPY default.conf  /etc/nginx/conf.d/default.conf
RUN rm /etc/nginx/conf.d/examplessl.conf

COPY ./conteudo/index.html  /usr/share/nginx/html/
COPY ./conteudo/index2.html  /usr/share/nginx/html/
COPY ./conteudo/index3.html  /usr/share/nginx/html/
COPY ./conteudo/index4.html  /usr/share/nginx/html/
COPY ./conteudo/index5.html  /usr/share/nginx/html/
COPY ./conteudo/index6.html  /usr/share/nginx/html/
COPY ./conteudo/index7.html  /usr/share/nginx/html/
COPY ./conteudo/index8.html  /usr/share/nginx/html/
COPY ./conteudo/index9.html  /usr/share/nginx/html/
COPY ./conteudo/index10.html  /usr/share/nginx/html/
COPY ./conteudo/50x.html /usr/share/nginx/html/ 
COPY ./conteudo/Brazil-Sao-Paulo.jpg /usr/share/nginx/html/
COPY ./conteudo/marginal-tiete-zn.jpg   /usr/share/nginx/html/
COPY ./conteudo/Sao_Paulo_Bela_Vista.jpg  /usr/share/nginx/html/
COPY ./conteudo/Sao-Paulo-centro.jpeg  /usr/share/nginx/html/
COPY ./conteudo/sao-paulo-img.jpg  /usr/share/nginx/html/
COPY ./conteudo/sp-noite.jpeg /usr/share/nginx/html/

