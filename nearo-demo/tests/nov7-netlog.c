#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>

/* Test helper. Logs non-local socket attempts and refuses them. */
static void note(const char *op, int domain) {
    const char *path;
    FILE *f;
    if (domain == AF_UNIX) return;
    path = getenv("NOV7_NET_LOG");
    if (!path || !path[0]) return;
    f = fopen(path, "a");
    if (!f) return;
    fprintf(f, "%s domain=%d\n", op, domain);
    fclose(f);
}

static int domain_of(int fd) {
    int domain = -1;
    socklen_t len = sizeof(domain);
    if (getsockopt(fd, SOL_SOCKET, SO_DOMAIN, &domain, &len) != 0) return -1;
    return domain;
}

int connect(int fd, const struct sockaddr *addr, socklen_t len) {
    int domain = domain_of(fd);
    static int (*real_connect)(int, const struct sockaddr *, socklen_t);
    if (domain != AF_UNIX) {
        note("connect", domain);
        errno = ENETUNREACH;
        return -1;
    }
    if (!real_connect) real_connect = dlsym(RTLD_NEXT, "connect");
    return real_connect(fd, addr, len);
}

ssize_t sendto(int fd, const void *buf, size_t len, int flags,
               const struct sockaddr *dest, socklen_t addrlen) {
    int domain = domain_of(fd);
    static ssize_t (*real_sendto)(int, const void *, size_t, int, const struct sockaddr *, socklen_t);
    if (domain != AF_UNIX) {
        note("sendto", domain);
        errno = ENETUNREACH;
        return -1;
    }
    if (!real_sendto) real_sendto = dlsym(RTLD_NEXT, "sendto");
    return real_sendto(fd, buf, len, flags, dest, addrlen);
}

int sendmmsg(int fd, struct mmsghdr *msgvec, unsigned int vlen, int flags) {
    int domain = domain_of(fd);
    static int (*real_sendmmsg)(int, struct mmsghdr *, unsigned int, int);
    if (domain != AF_UNIX) {
        note("sendmmsg", domain);
        errno = ENETUNREACH;
        return -1;
    }
    if (!real_sendmmsg) real_sendmmsg = dlsym(RTLD_NEXT, "sendmmsg");
    return real_sendmmsg(fd, msgvec, vlen, flags);
}
