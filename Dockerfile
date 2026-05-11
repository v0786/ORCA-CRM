ARG APP=ics

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps ./apps
COPY shared ./shared

RUN npm ci
RUN npm --workspace apps/${APP} run build

FROM nginx:1.27-alpine AS runtime
COPY ./deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

